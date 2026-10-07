import React, { useRef } from 'react';
import { Printer, X, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/formatters';

export interface OrderItem {
  itemId: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
  specialInstructions?: string | null;
}

export interface OrderData {
  id: string;
  orderNumber: number;
  tableNumber: string;
  status: string;
  paymentStatus?: string;
  paymentMethod?: string;
  riskScore?: string;
  riskSignals?: string[];
  source: string;
  createdAt: string;
  items: OrderItem[];
  customerNote?: string | null;
  subtotal: number;
  taxes: number;
  total: number;
  paidAt?: string | null;
  paymentTransactionId?: string | null;
}

interface KotModalProps {
  order: OrderData;
  restaurantName: string;
  onClose: () => void;
}

export function KotModal({ order, restaurantName, onClose }: KotModalProps) {
  const [copied, setCopied] = React.useState(false);
  const ticketRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  const handleCopyText = () => {
    const lines = [
      '------------------------------------------',
      `          ${restaurantName.toUpperCase()}`,
      '         KITCHEN ORDER TICKET',
      '------------------------------------------',
      `KOT #: KOT-${order.orderNumber}     ORDER #: #${order.orderNumber}`,
      `TABLE: TABLE ${order.tableNumber}`,
      `DATE : ${formatDateTime(order.createdAt, 'full')}`,
      `TYPE : ${order.source === 'QR' ? 'QR SELF-ORDER' : 'MANUAL STAFF ORDER'}`,
      `PAY  : ${order.paymentStatus || 'PENDING'} (${order.paymentMethod || 'PAY_LATER'})`,
      '------------------------------------------',
      'QTY   ITEM',
      '------------------------------------------',
    ];

    for (const item of order.items) {
      lines.push(` ${String(item.quantity).padEnd(4)} ${item.name.toUpperCase()}`);
      if (item.specialInstructions) {
        lines.push(`      * NOTE: ${item.specialInstructions}`);
      }
    }

    lines.push('------------------------------------------');
    if (order.customerNote) {
      lines.push('SPECIAL TABLE INSTRUCTIONS:');
      lines.push(`"${order.customerNote}"`);
      lines.push('------------------------------------------');
    }
    lines.push(`STATUS: ${order.status}`);
    lines.push('------------------------------------------');

    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm print:p-0">
      {/* Non-print container */}
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl print:hidden">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
              Print-Ready Ticket
            </span>
            <h2 className="font-display text-2xl">Kitchen Order Ticket (KOT)</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            data-testid="button-close-kot"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Thermal Preview Box */}
        <div className="my-5 overflow-y-auto rounded-xl border border-border bg-[#fffef9] p-5 font-mono text-xs text-black shadow-inner max-h-[60vh]">
          <div className="text-center">
            <h3 className="text-sm font-bold tracking-wider">{restaurantName.toUpperCase()}</h3>
            <p className="text-[11px] font-semibold text-gray-700">KITCHEN ORDER TICKET</p>
            <p className="mt-1 text-[10px] text-gray-500">------------------------------------------</p>
          </div>

          <div className="mt-2 flex justify-between font-bold">
            <span>KOT: #<span className="font-sans tabular-nums">{order.orderNumber}</span></span>
            <span>TABLE: <span className="font-sans tabular-nums">{order.tableNumber}</span></span>
          </div>
          <div className="text-[11px] text-gray-600">
            <span className="font-sans tabular-nums">{formatDateTime(order.createdAt, 'time')}</span>
            <span className="ml-3 uppercase">[{order.source === 'QR' ? 'QR Scan' : 'Staff Manual'}]</span>
          </div>
          <p className="text-[10px] text-gray-500">------------------------------------------</p>

          <div className="my-2 space-y-2">
            <div className="grid grid-cols-[3rem_1fr] text-[11px] font-bold uppercase text-gray-700">
              <span>QTY</span>
              <span>ITEM</span>
            </div>
            <p className="text-[10px] text-gray-400">------------------------------------------</p>
            {order.items.map((item, idx) => (
              <div key={idx} className="space-y-0.5">
                <div className="grid grid-cols-[3rem_1fr] text-xs font-bold">
                  <span className="text-black"><span className="font-sans tabular-nums">{item.quantity}</span>x</span>
                  <span className="uppercase text-black">{item.name}</span>
                </div>
                {item.specialInstructions && (
                  <div className="ml-12 text-[11px] font-semibold text-amber-800 bg-amber-50 p-1 rounded">
                    ⚡ {item.specialInstructions}
                  </div>
                )}
              </div>
            ))}
          </div>

          {order.customerNote && (
            <div className="mt-3 border-t border-dashed border-gray-300 pt-2">
              <p className="text-[10px] font-bold uppercase text-gray-600">Table Note:</p>
              <p className="text-xs italic font-semibold text-black bg-yellow-50 p-1.5 rounded mt-0.5">
                "{order.customerNote}"
              </p>
            </div>
          )}

          <p className="mt-3 text-[10px] text-gray-500">------------------------------------------</p>
          <div className="flex justify-between font-bold text-xs">
            <span>STATUS: {order.status}</span>
            <span>ITEMS: <span className="font-sans tabular-nums">{order.items.reduce((s, i) => s + i.quantity, 0)}</span></span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <Button
            variant="outline"
            onClick={handleCopyText}
            className="flex items-center gap-2 rounded-xl text-xs font-semibold"
            data-testid="button-copy-kot"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied text' : 'Copy raw text'}
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} className="rounded-xl text-xs font-semibold">
              Done
            </Button>
            <Button
              onClick={handlePrint}
              className="flex items-center gap-2 rounded-xl bg-primary text-primary-foreground font-bold"
              data-testid="button-trigger-print"
            >
              <Printer className="h-4 w-4" /> Print Thermal KOT
            </Button>
          </div>
        </div>
      </div>

      {/* Actual Print Element for 58mm/80mm Thermal Printer */}
      <div id="kot-thermal-ticket" ref={ticketRef} className="hidden print:block font-mono text-black text-xs">
        <style>{`
          @media print {
            body * { visibility: hidden !important; }
            #kot-thermal-ticket, #kot-thermal-ticket * { visibility: visible !important; }
            #kot-thermal-ticket {
              position: absolute;
              left: 0;
              top: 0;
              width: 72mm;
              padding: 4mm;
              background: #fff;
              color: #000;
              font-family: monospace;
              font-size: 11px;
              line-height: 1.3;
            }
          }
        `}</style>
        <div style={{ textAlign: 'center', marginBottom: '6px' }}>
          <div style={{ fontSize: '14px', fontWeight: 'bold' }}>{restaurantName.toUpperCase()}</div>
          <div style={{ fontSize: '11px', fontWeight: 'bold' }}>KITCHEN ORDER TICKET (KOT)</div>
          <div>------------------------------------</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '12px' }}>
          <span>KOT #{order.orderNumber}</span>
          <span>TABLE {order.tableNumber}</span>
        </div>
        <div style={{ fontSize: '10px' }}>
          {formatDateTime(order.createdAt, 'full')}
          &nbsp;[{order.source === 'QR' ? 'QR' : 'STAFF'}]
        </div>
        <div>------------------------------------</div>
        <div style={{ fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
          <span>QTY  ITEM</span>
        </div>
        <div>------------------------------------</div>
        {order.items.map((item, idx) => (
          <div key={idx} style={{ marginBottom: '4px' }}>
            <div style={{ fontWeight: 'bold' }}>
              {item.quantity}x &nbsp;{item.name.toUpperCase()}
            </div>
            {item.specialInstructions && (
              <div style={{ paddingLeft: '14px', fontStyle: 'italic', fontSize: '10px' }}>
                * NOTE: {item.specialInstructions}
              </div>
            )}
          </div>
        ))}
        {order.customerNote && (
          <div style={{ marginTop: '6px', borderTop: '1px dashed #000', paddingTop: '4px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '10px' }}>TABLE INSTRUCTION:</div>
            <div style={{ fontStyle: 'italic' }}>"{order.customerNote}"</div>
          </div>
        )}
        <div style={{ marginTop: '6px' }}>------------------------------------</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
          <span>STATUS: {order.status}</span>
          <span>ITEMS: {order.items.reduce((s, i) => s + i.quantity, 0)}</span>
        </div>
        <div style={{ textAlign: 'center', marginTop: '8px' }}>*** END OF KOT ***</div>
      </div>
    </div>
  );
}
