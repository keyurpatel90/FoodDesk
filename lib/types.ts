export type Station='waffle'|'chole'|'pav';
export type Product={id:string;name:string;price:number;station:Station;active:boolean};
export type CartItem={product:Product;qty:number};
export type OrderItem={id:string;order_id:string;product_id:string;product_name:string;station:Station;qty:number;price:number;status:string};
export type Order={id:string;order_no:number;status:string;total:number;payment_method:string;created_at:string;items:OrderItem[]};
