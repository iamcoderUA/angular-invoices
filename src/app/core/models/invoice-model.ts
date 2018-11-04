import { InvoiceItem } from '../interfaces/invoice-item';
import { Customer } from '../interfaces/customer';
import { CustomerModel } from './customer-model';

export class InvoiceModel {
  
  id: number;
  customer_id: number = null;
  customer?: Customer = new CustomerModel();
  discount: number = null;
  total: number = null;
  items: InvoiceItem[] = [];
  
  constructor(obj?: any) {
    for (const field in obj) {
      if (typeof this[field] !== 'undefined') {
        this[field] = obj && obj[field];
      }
    }
  }
}
