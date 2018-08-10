import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';

import * as _ from 'lodash';
import { Observable } from 'rxjs/Observable';
import { Subscription } from 'rxjs/Subscription';
import { map, filter, switchMap } from 'rxjs/operators';

import { CustomersService } from '../core/services/customers.service';
import { ProductsService } from '../core/services/products.service';
import { InvoicesService } from '../core/services/invoices.service';

import { Customer } from '../core/interfaces/customer';
import { Product } from '../core/interfaces/product';


@Component({
  selector: 'app-create-edit-invoice',
  templateUrl: './create-edit-invoice.component.html',
  styleUrls: ['./create-edit-invoice.component.scss']
})
export class CreateEditInvoiceComponent implements OnInit, OnDestroy {

  createInvoiceForm: FormGroup;
  customersList$: Observable<Customer[]>;
  productsList$: Observable<Product[]>;
  createInvoiceFormSubscription: Subscription;
  productControlSubscription: Subscription;

  constructor(
    private customerService: CustomersService,
    private productsService: ProductsService,
    private invoicesService: InvoicesService,
  ) {
  }

  get createInvoiceNameControl() {
    return this.createInvoiceForm.get('name');
  }
  get createInvoiceProductControl() {
    return this.createInvoiceForm.get('product');
  }
  get createInvoiceQuantityControl() {
    return this.createInvoiceForm.get('quantity');
  }
  get createInvoicePriceControl() {
    return this.createInvoiceForm.get('price');
  }
  get createInvoiceDiscountControl() {
    return this.createInvoiceForm.get('discount');
  }
  get createInvoiceTotalControl() {
    return this.createInvoiceForm.get('total');
  }

  ngOnInit() {
    this.customersList$ = this.customerService.customersList$;
    this.productsList$ = this.productsService.productsList$;

    this.createInvoiceForm = new FormGroup({
      name: new FormControl(),
      product: new FormControl(),
      quantity: new FormControl(null, { updateOn: 'blur' }),
      price: new FormControl(null),
      discount: new FormControl(null, { updateOn: 'blur' }),
      total: new FormControl(),
    });

    this.createInvoiceFormSubscription = this.createInvoiceForm.valueChanges.pipe(
      filter(form =>  form.quantity && form.product),
    ).subscribe(form => {
        const total = (form.quantity * form.price) * ((100 - form.discount) / 100);
        return this.createInvoiceTotalControl.patchValue(total, {onlySelf: true});
      }
    );
    this.productControlSubscription = this.createInvoiceProductControl.valueChanges.pipe(
      switchMap( productName => this.productsList$.pipe(
        map(products => _.find(products, {'name': productName}).price),
      ))
    ).subscribe(price => this.createInvoicePriceControl.patchValue(price));
  }

  onSubmit() {
  }

  ngOnDestroy() {
    this.createInvoiceFormSubscription.unsubscribe();
    this.productControlSubscription.unsubscribe();
  }
}