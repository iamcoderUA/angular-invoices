import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import * as _ from 'lodash';
import { Observable } from 'rxjs/Observable';
import { ConnectableObservable } from 'rxjs/observable/ConnectableObservable';
import { Subject } from 'rxjs/Subject';
import { combineLatest } from 'rxjs/observable/combineLatest';
import {
  distinctUntilChanged, filter,
  map, mapTo, mergeMap,
  mergeScan, publish, publishReplay, refCount,
  switchMap,
  take, takeLast,
  tap,
  withLatestFrom
} from 'rxjs/operators';
import 'rxjs/add/operator/publishReplay';
import 'rxjs/add/observable/of';
import 'rxjs/add/observable/merge';

import { Invoice } from '../interfaces/invoice';
import { InvoiceItem } from '../interfaces/invoice-item';

import { CustomersService } from './customers.service';
import { ProductsService } from './products.service';
import { ModalBoxService } from './modal-box.service';
import { BehaviorSubject } from 'rxjs/BehaviorSubject';

@Injectable()
export class InvoicesService {
  
  passInvoiceRequest: Subject<Observable<Invoice[]>> = new Subject();
  invoicesList$: ConnectableObservable<Invoice[]>;
  invoicesListCombined$: Observable<Invoice[]>;
  invoicesCollection$: ConnectableObservable<Invoice[]>;

  passItemsRequest$: BehaviorSubject<number> = new BehaviorSubject(null);
  passItemsRequest2$: Subject<number> = new Subject();
  invoicesItemsList$: ConnectableObservable<InvoiceItem[]>;
  currentInvoice$: ConnectableObservable<Invoice>;

  viewInvoice$: Observable<Invoice>;
  
  passCreateInvoiceRequest$: Subject<any> = new Subject();
  createInvoice$: Observable<Invoice>;
  
  addInvoice$: Subject<{}> = new Subject();
  addInvoiceCollection$: Observable<any>;

  deleteInvoice$: Subject<number> = new Subject();
  deleteInvoiceOpenModal$: Subject<number> = new Subject();
  deleteInvoiceCollection$: Observable<Invoice[]>;
  deleteInvoiceModal$: ConnectableObservable<Invoice>;
  
  constructor(
    private httpClient: HttpClient,
    private customersService: CustomersService,
    private productsService: ProductsService,
    private modalBoxService: ModalBoxService,
  ) {
    // getting initial invoices collection
    this.invoicesList$ = this.passInvoiceRequest.pipe(
      mergeScan(acc => acc ? Observable.of(acc) : this.getInvoicesRequest(), null),
    ).publishReplay(1);
    this.invoicesList$.connect();
    
    // getting initial invoice-items collection
    // this.invoicesItemsList$ = this.passItemsRequest$.pipe(
    //   distinctUntilChanged(),
    //   switchMap(id => id ? this.getInvoiceItemsRequest(id) : Observable.of(null)),
    //   tap((res) => console.error('async', res )),
    // ).publishReplay(1);
    // this.invoicesItemsList$.connect();

    // getting current invoice for the view page
    this.currentInvoice$ = this.passItemsRequest2$.pipe(
      distinctUntilChanged(),
      switchMap(id => this.invoicesCollection$.pipe(
        map(invoices => invoices.find(invoice => invoice.id === id)))
      ),
      tap((res) => console.error('sync', res)),
    ).publishReplay(1);
    this.currentInvoice$.connect();

    // this.viewInvoice$ = combineLatest(
    //   this.productsService.productsList$,
    //   this.invoicesItemsList$,
    //   this.currentInvoice$,
    // ).pipe(
    //   filter(([products, invoiceItems, currentInvoice]) => invoiceItems ? invoiceItems[0].invoice_id === currentInvoice.id : true),
    //   map(([products, invoiceItems, currentInvoice]) => {
    //     const items = _.map(invoiceItems, item =>
    //       ({
    //         ...item,
    //         product: products.find(product => item.product_id === product.id),
    //       }));
    //     return {
    //       ...currentInvoice,
    //       items: [...items],
    //     };
    //   }),
    // );
  
    this.viewInvoice$ = this.passItemsRequest$.pipe(
      switchMap(id => id ? this.getInvoiceItemsRequest(id) : Observable.of(null)),
      switchMap(invoiceItems => this.productsService.productsList$.pipe(
        map(products => {
          return _.map(invoiceItems, item =>
            ({
              ...item,
              product: products.find(product => item.product_id === product.id),
            }));
        })
      )),
      switchMap(items => this.currentInvoice$.pipe(
        map(currentInvoice =>
          ({
            ...currentInvoice,
            items: [...items],
          }))
      )),
      tap((res) => console.error('view', res)),
      publish(),
      refCount()
    );

    // adding customer info to initial invoices collection
    this.invoicesListCombined$ = combineLatest(
      this.invoicesList$,
      this.customersService.customersList$.pipe(take(1))
    ).pipe(
      map(([invoices, customers]) => invoices.map(invoice =>
        ({
          ...invoice,
          customer: customers.find(customer => invoice.customer_id === customer.id),
        }))
      ),
    );
  
    // prepare data to according format and save new invoice
    this.createInvoice$ = this.passCreateInvoiceRequest$.pipe(
      switchMap(data => {
        const invoiceItems = data.items.map(item =>
          ({
            product_id: item.product_id,
            quantity: item.quantity,
          }));
        const invoice = {
          customer_id: data.customer_id,
          discount: data.discount,
          total: data.total,
          items: [...invoiceItems],
        };
        return this.postInvoiceRequest(invoice);
      }),
    );

    // add a new invoice to a collection
    this.addInvoiceCollection$ = this.addInvoice$.pipe(
      switchMap(newInvoice => this.invoicesCollection$.pipe(
        take(1),
        withLatestFrom(this.customersService.customersList$),
        map(([invoices, customers]) =>
          [
            ...invoices,
            {...newInvoice, customer: customers.find(customer => newInvoice['customer_id'] === customer.id)},
          ]
        ),
      ))
    );

    // delete an invoice invoice from collection
    this.deleteInvoiceCollection$ = this.deleteInvoice$.pipe(
      switchMap(id => this.invoicesCollection$.pipe(
        take(1),
        map(invoices => invoices.filter(invoice => invoice.id !== id))
      ))
    );

    // open delete invoice modal window and by success send a delete request to DB
    this.deleteInvoiceModal$ = this.deleteInvoiceOpenModal$.pipe(
      mergeMap(id => this.modalBoxService.confirmModal('Are you sure you want to delete an invoice?').pipe(
        filter(choice => !!choice),
        mapTo(id)
      )),
      switchMap(id => this.deleteInvoiceRequest(id)),
      tap(invoices => this.modalBoxService.confirmModal(`Invoice number ${invoices.id} has been deleted`, false)),
    ).publishReplay(1);
    this.deleteInvoiceModal$.connect();

    // main invoices collection to display
    this.invoicesCollection$ = Observable.merge(
      this.invoicesListCombined$.pipe(take(1)),
      this.addInvoiceCollection$,
      this.deleteInvoiceCollection$,
    ).publishReplay(1);
    this.invoicesCollection$.connect();
  }

  getInvoicesRequest() {
    return this.httpClient.get<Invoice[]>('invoices');
  }

  getInvoiceItemsRequest(id) {
    return this.httpClient.get<InvoiceItem[]>(`invoices/${id}/items`);
  }

  getInvoices() {
    this.passInvoiceRequest.next();
    return this.invoicesList$;
  }

  getInvoiceItems(id: number) {
    this.passItemsRequest2$.next(id);
    this.passItemsRequest$.next(id);
    return this.viewInvoice$;
  }

  postInvoiceRequest(invoice) {
    return this.httpClient.post<Invoice>('invoices', invoice);
  }

  deleteInvoiceRequest(id) {
    return this.httpClient.delete<Invoice>(`invoices/${id}`).pipe(
      tap(deletedInvoice => this.deleteInvoice$.next(deletedInvoice.id))
    );
  }
}
