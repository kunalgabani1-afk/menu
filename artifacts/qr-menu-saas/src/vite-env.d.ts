/// <reference types="vite/client" />

declare module "qrcode" {
  export function toDataURL(text: string, options?: any): Promise<string>;
  export function toString(text: string, options?: any): Promise<string>;
  export function toCanvas(canvas: any, text: string, options?: any): Promise<void>;
  const qrcode: any;
  export default qrcode;
}
