"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

type ColumnDef = {
  name: string;
  type: string;
  meaning: string;
  stat?: string;
  index?: number;
};

type SemanticObject = {
  table: string;
  entity: string;
  description: string;
  columns: Record<string, string>;
};

type DatasetRecord = {
  id: string;
  table_name: string;
  file_name: string;
  size: number;
  icon: string;
  row_count: number;
  created_at: string;
  columns: ColumnDef[];
  facts?: {
    span?: { min: string; max: string } | null;
    moneyTop?: { name: string; friendly: string; sum: number; sym: string } | null;
    customers?: number | null;
    margin?: number | null;
  };
  semantic_object: SemanticObject;
};

type QueueItem = {
  id: string;
  name: string;
  size: number;
  file: File;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  context?: DatasetRecord;
  icon?: string;
  restored?: boolean;
};

const STORAGE_KEY = 'merchmind_datasets';

const ICONS: Record<string, string> = {
  file: '<path d="M3.5 1.8h6l3 3v9.4h-9z"/><path d="M9.5 1.8v3h3"/>',
  receipt: '<path d="M4 1.8h8v12.4l-2-1.2-2 1.2-2-1.2-2 1.2z"/><path d="M6.2 5.6h3.6M6.2 8.4h3.6"/>',
  person: '<circle cx="8" cy="5.4" r="2.6"/><path d="M2.9 13.8c.9-3.1 2.9-4.7 5.1-4.7s4.2 1.6 5.1 4.7"/>',
  tag: '<path d="M2.5 2.5h5.8L14 8.2 8.2 14l-5.7-5.7z"/><circle cx="5.4" cy="5.4" r="1.1"/>',
  card: '<rect x="1.8" y="3.6" width="12.4" height="8.8" rx="2"/><path d="M1.8 6.7h12.4"/>',
  undo: '<path d="M6.4 3.4 2.9 6.9l3.5 3.5"/><path d="M2.9 6.9h6.4a3.6 3.6 0 0 1 0 7.2H8"/>',
  box: '<path d="M8 1.8 14 5v6.2L8 14.2 2 11.2V5z"/><path d="M2 5l6 3.1 6-3.1M8 8.1v6.1"/>',
  invoice: '<path d="M3.5 1.8h6l3 3v9.4h-9z"/><path d="M9.5 1.8v3h3M6 7.6h3.8M6 10.4h3.8"/>',
  link: '<path d="M6.7 9.3 9.3 6.7"/><path d="M4.8 7.5 3.2 9.1a2.7 2.7 0 0 0 3.8 3.8l1.6-1.6M11.2 8.5l1.6-1.6a2.7 2.7 0 0 0-3.8-3.8L7.4 4.7"/>',
  spark: '<path d="M8 1.5 9.6 6.4 14.5 8 9.6 9.6 8 14.5 6.4 9.6 1.5 8 6.4 6.4z" fill="currentColor" stroke="none"/>',
  check: '<path d="M3 8.5l3.2 3L13 4.5"/>',
  x: '<path d="M3.5 3.5l9 9m0-9-9 9"/>',
  chev: '<path d="M4 6.5 8 10.5l4-4"/>',
  warn: '<circle cx="8" cy="8" r="6.3"/><path d="M8 4.8v3.8M8 11.3v.1"/>',
};

const SYN: Record<string, string> = { client: 'customer', buyer: 'customer', user: 'customer', member: 'customer', item: 'product', sku: 'product', txn: 'transaction', payment: 'transaction', charge: 'transaction', refund: 'return', vendor: 'supplier' };
const ENTITIES = ['order', 'customer', 'product', 'transaction', 'return', 'invoice', 'supplier', 'employee', 'store', 'category', 'variant'];
const MONEY_TOK = /(^|_)(total|totals|revenue|amount|amounts|sales?|price|prices|subtotal|spend|spending|ltv|lifetime|cost|costs|fee|fees|margin|margins|refund|refunds|discount|discounts|profit|value|values|shipping|tax|taxes|balance|paid)(_|$)/;
const QUAL: Record<string, string> = { total: 'total amount', totals: 'total amount', subtotal: 'pre-tax subtotal', shipping: 'shipping cost', tax: 'tax', taxes: 'tax', cost: 'unit cost', costs: 'unit cost', price: 'unit price', prices: 'unit price', fee: 'processing fee', fees: 'processing fees', refund: 'refund amount', refunds: 'refund amounts', discount: 'discount', ltv: 'lifetime value', lifetime: 'lifetime value', revenue: 'revenue', amount: 'amount', amounts: 'amounts', value: 'monetary value', values: 'monetary values', spend: 'total spend', spending: 'total spend', margin: 'margin', margins: 'margin', profit: 'profit', balance: 'outstanding balance', paid: 'amount paid', sale: 'sale amount', sales: 'sales' };

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
      else if (c !== '\r') field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

function singularize(s: string): string {
  s = s.toLowerCase();
  if (/ies$/.test(s) && s.length > 4) return s.replace(/ies$/, 'y');
  if (/(ses|xes|zes)$/.test(s)) return s.replace(/es$/, '');
  if (/s$/.test(s) && s.length > 3) return s.slice(0, -1);
  return s;
}

function cleanStem(name: string): string {
  const s = String(name).toLowerCase().replace(/\.(csv|tsv|txt)$/, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(my|sample|test|final|new|copy)_/, '').replace(/_\d+$/, '');
  return s || 'dataset';
}

function colBase(name: string): string {
  const n = String(name).toLowerCase().replace(/[\s\-]/g, '_');
  let base = n.replace(/(_id|_key|_code|_no|_num|_number)$/, '');
  if (!base || (base === n && n !== 'sku')) {
    if (n === 'sku') base = 'sku';
    else if (/^(id|key|code)$/.test(n)) base = 'refless';
    else base = n.replace(/(_id|_key|_code|_no|_num|_number)$/, '');
  }
  if (SYN[base]) base = SYN[base];
  return singularize(base);
}

function parseNum(v: string): number {
  const x = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(x) ? 0 : x;
}

function distinctValues(arr: string[]): string[] {
  const o: Record<string, number> = {};
  arr.forEach((v) => { o[v] = 1; });
  return Object.keys(o);
}

function moneyQualifier(n: string): string {
  const m = String(n).match(MONEY_TOK);
  const t = m && m[2];
  return (t && QUAL[t]) || 'amount';
}

function dateEvent(n: string): string {
  if (/order/.test(n)) return 'order placed';
  if (/created/.test(n)) return 'record created';
  if (/updated|modified/.test(n)) return 'last updated';
  if (/join|signup|register/.test(n)) return 'joined';
  if (/paid|payment|settle/.test(n)) return 'payment settled';
  if (/ship|fulfil/.test(n)) return 'shipped';
  if (/refund/.test(n)) return 'refund issued';
  if (/return/.test(n)) return 'return processed';
  if (/first/.test(n)) return 'first activity';
  if (/last/.test(n)) return 'latest activity';
  return 'event';
}

function numberMeaning(n: string): string {
  if (/stock|inventory|on_hand/.test(n)) return 'units in stock';
  if (/rating|score|stars/.test(n)) return 'rating';
  if (/(^|_)(age|year)s?($|_)/.test(n)) return 'age / year';
  if (/count/.test(n)) return 'record count';
  if (/items?|qty|quantity|units?|orders?|visits?|sessions?/.test(n)) return 'item count';
  return 'numeric measure';
}

function enumMeaning(n: string): string {
  if (/status/.test(n)) return 'status field';
  if (/segment/.test(n)) return 'customer segment';
  if (/categor/.test(n)) return 'category';
  if (/reason/.test(n)) return 'reason code';
  if (/method/.test(n)) return 'payment method';
  if (/channel/.test(n)) return 'sales channel';
  if (/(^|_)(type|kind)($|_)/.test(n)) return 'type';
  if (/city/.test(n)) return 'city';
  if (/country|region|state|province/.test(n)) return 'geography';
  return 'category field';
}

function textMeaning(n: string): string {
  if (/email/.test(n)) return 'email address';
  if (/phone|tel/.test(n)) return 'phone number';
  if (/name/.test(n)) return 'name';
  if (/city/.test(n)) return 'city';
  if (/country|region|state|province/.test(n)) return 'geography';
  if (/address/.test(n)) return 'street address';
  if (/url|link|site/.test(n)) return 'link';
  if (/note|comment|description|desc/.test(n)) return 'free-text description';
  if (/title/.test(n)) return 'title';
  return 'descriptive text';
}

function analyzeColumn(name: string, values: string[], stemBase: string): ColumnDef {
  const n = String(name).toLowerCase();
  const clean = values.filter((v) => v !== '');
  const res: ColumnDef = { name, type: 'text', meaning: 'descriptive text' };
  if (!clean.length) return res;

  const dateRe = /^\d{4}-\d{1,2}-\d{1,2}([ T]\d{2}:\d{2}(:\d{2})?)?([+-]\d{2}:?\d{2})?$|^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/;
  if (clean.every((v) => dateRe.test(v))) {
    const sorted = clean.slice().sort();
    res.type = 'date';
    res.meaning = 'timestamp — ' + dateEvent(n);
    res.stat = `${sorted[0]} → ${sorted[sorted.length - 1]}`;
    return res;
  }

  const idish = /(_id|_key|_code|_no|_num|_number)$/.test(n) || /^(id|key|code|sku)$/.test(n);
  if (idish) {
    const base = colBase(name);
    if (ENTITIES.indexOf(base) > -1) {
      if (base === stemBase) { res.type = 'id'; res.meaning = 'primary identifier'; }
      else { res.type = 'ref'; res.meaning = 'reference → ' + (base.replace(/y$/, '') + 'ies' === base + 's' ? base.replace(/y$/, '') + 'ies' : base + 's'); }
    } else { res.type = 'id'; res.meaning = 'primary identifier'; }
    const dist = distinctValues(clean).length;
    res.stat = `${dist} unique`;
    return res;
  }

  const numRe = /^-?[$\u20AC\u00A3\u00A5]?\s?[\d,]+(\.\d+)?%?$/;
  if (clean.every((v) => numRe.test(v))) {
    const nums = clean.map(parseNum);
    const sum = nums.reduce((a, b) => a + b, 0);
    const avg = sum / nums.length;
    if (MONEY_TOK.test(n)) {
      res.type = 'money';
      res.meaning = 'monetary — ' + moneyQualifier(n);
      res.stat = `avg ${avg.toFixed(2)}`;
    } else {
      res.type = 'number';
      res.meaning = numberMeaning(n);
      res.stat = `\u03A3 ${sum.toFixed(1)}`;
    }
    return res;
  }

  const vals = distinctValues(clean);
  const limit = Math.max(4, Math.min(12, Math.floor(clean.length * 0.5)));
  if (vals.length <= limit && clean.length > 2) {
    res.type = 'enum';
    res.meaning = enumMeaning(n);
    res.stat = `${vals.length} values — ${vals.slice(0, 4).join(', ')}`;
    return res;
  }

  res.meaning = textMeaning(n);
  res.stat = `${vals.length} unique`;
  return res;
}

const ENTITY_RULES = [
  { re: /return|refund/, entity: 'Returns', ic: 'undo', desc: (k: ColumnDef | undefined) => `Return events${k ? ' linked by ' + k.name : ''} — one row per returned order, with reasons and refund amounts.` },
  { re: /transaction|payment|txn|charge|payout/, entity: 'Transactions', ic: 'card', desc: (k: ColumnDef | undefined) => `Payment ledger${k ? ' keyed by ' + k.name : ''} — one row per charge, reconcilable against your orders.` },
  { re: /customer|client|buyer|member/, entity: 'Customers', ic: 'person', desc: (k: ColumnDef | undefined) => `Customer directory${k ? ' keyed by ' + k.name : ''} — one row per buyer, with lifecycle attributes.` },
  { re: /product|catalog|item|sku/, entity: 'Products', ic: 'tag', desc: (k: ColumnDef | undefined) => `Product catalog${k ? ' keyed by ' + k.name : ''} — one row per SKU, with pricing and stock.` },
  { re: /invoice|billing/, entity: 'Invoices', ic: 'invoice', desc: (k: ColumnDef | undefined) => `Invoice records${k ? ' keyed by ' + k.name : ''} — one row per issued invoice.` },
  { re: /inventor|stock/, entity: 'Inventory', ic: 'box', desc: (k: ColumnDef | undefined) => `Inventory snapshot${k ? ' keyed by ' + k.name : ''} — stock positions per product or location.` },
  { re: /supplier|vendor/, entity: 'Suppliers', ic: 'box', desc: (k: ColumnDef | undefined) => `Supplier directory${k ? ' keyed by ' + k.name : ''} — one row per vendor you buy from.` },
  { re: /employee|staff|team/, entity: 'Employees', ic: 'person', desc: (k: ColumnDef | undefined) => `Staff directory${k ? ' keyed by ' + k.name : ''} — one row per team member.` },
  { re: /order/, entity: 'Orders', ic: 'receipt', desc: (k: ColumnDef | undefined) => `Order-level ledger${k ? ' keyed by ' + k.name : ''} — one row per purchase.` },
];

function titleCase(s: string): string {
  return s.split(' ').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
}

function buildRecord(item: { name: string; size: number }, rows: string[][]): DatasetRecord {
  const header = rows[0];
  const data = rows.slice(1);
  const stem = cleanStem(item.name);
  const stemBase = singularize(stem);
  let sym = '$';
  outer: for (let rr = 0; rr < Math.min(data.length, 120); rr++) {
    const row = data[rr];
    for (let cc = 0; cc < row.length; cc++) {
      const m = String(row[cc]).match(/^[\u20AC\u00A3\u00A5]/);
      if (m) { sym = m[0]; break outer; }
    }
  }
  const cols = header.map((h, i) => {
    const name = String(h).trim() || (`column_${i + 1}`);
    const values = data.map((row) => (row[i] != null ? String(row[i]).trim() : ''));
    const c = analyzeColumn(name, values, stemBase);
    c.index = i;
    return c;
  });

  let margin: number | null = null;
  const pCol = cols.filter((c) => c.type === 'money').find((c) => /price/.test(c.name.toLowerCase()));
  const cCol = cols.filter((c) => c.type === 'money').find((c) => /(^|_)cost/.test(c.name.toLowerCase()));
  if (pCol && cCol && pCol.index !== undefined && cCol.index !== undefined) {
    let s = 0;
    let n2 = 0;
    data.forEach((row) => {
      const p = parseNum(row[pCol.index!]);
      const q = parseNum(row[cCol.index!]);
      if (p > 0) { s += ((p - q) / p) * 100; n2++; }
    });
    if (n2) margin = Math.round(s / n2);
  }

  let moneyTop: { name: string; friendly: string; sum: number; sym: string } | null = null;
  cols.forEach((c) => {
    if (c.type === 'money') {
      const values = data.map((row) => (row[c.index!] != null ? String(row[c.index!]) : ''));
      const sum = values.map(parseNum).reduce((a, b) => a + b, 0);
      if (!moneyTop || sum > moneyTop.sum) {
        moneyTop = { name: c.name, friendly: moneyQualifier(c.name.toLowerCase()), sum, sym };
      }
    }
  });

  const dateCol = cols.find((c) => c.type === 'date');
  const custRef = cols.find((c) => c.type === 'ref' && colBase(c.name) === 'customer');

  let rule = null;
  for (let k = 0; k < ENTITY_RULES.length; k++) {
    if (ENTITY_RULES[k].re.test(stem)) { rule = ENTITY_RULES[k]; break; }
  }
  const keyCol = cols.find((c) => c.type === 'id');
  let entity: string, icName: string, descBase: string;
  if (rule) {
    entity = rule.entity;
    icName = rule.ic;
    descBase = rule.desc(keyCol);
  } else {
    entity = titleCase(stem.replace(/_/g, ' '));
    icName = 'file';
    descBase = `${entity} records — ${data.length.toLocaleString('en-US')} rows across ${cols.length} columns${keyCol ? ', keyed by ' + keyCol.name : ''}.`;
  }

  let spanObj = null;
  if (dateCol) {
    const values = data.map((row) => (row[dateCol.index!] != null ? String(row[dateCol.index!]) : '')).sort();
    spanObj = { min: values[0], max: values[values.length - 1] };
  }

  const facts = {
    span: spanObj,
    moneyTop: moneyTop,
    customers: custRef ? distinctValues(data.map((row) => row[custRef.index!])).length : null,
    margin: margin,
  };

  const colRecords: ColumnDef[] = cols.map((c) => ({
    name: c.name,
    type: c.type,
    meaning: c.meaning,
    stat: c.stat,
  }));

  const colsMap: Record<string, string> = {};
  cols.forEach((c) => { colsMap[c.name] = c.meaning; });

  return {
    id: crypto.randomUUID(),
    table_name: stem,
    file_name: item.name,
    size: item.size,
    icon: icName,
    row_count: data.length,
    created_at: new Date().toISOString(),
    columns: colRecords,
    facts: facts,
    semantic_object: { table: stem, entity: entity, description: descBase, columns: colsMap },
  };
}

export default function MerchMindUpload() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<QueueItem[]>([]);
  const [openContexts, setOpenContexts] = useState<Record<string, boolean>>({});
  const [expandedCols, setExpandedCols] = useState<Record<string, boolean>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4200);
  }, []);

  useEffect(() => {
    try {
      const existing = localStorage.getItem(STORAGE_KEY);
      if (existing) {
        const parsed: DatasetRecord[] = JSON.parse(existing);
        const restored: QueueItem[] = parsed.map((rec) => ({
          id: rec.id || crypto.randomUUID(),
          name: rec.file_name,
          size: rec.size || 0,
          file: new File([], rec.file_name),
          status: 'completed',
          context: rec,
          icon: rec.icon,
          restored: true,
        }));
        setFiles(restored);
      }
    } catch {
      // ignore
    }
  }, []);

  function handleFiles(selectedFiles: FileList | null) {
    if (!selectedFiles) return;
    const newItems: QueueItem[] = [];
    Array.from(selectedFiles).forEach((f) => {
      if (!/\.csv$/i.test(f.name)) return;
      if (files.some((item) => item.name === f.name && item.size === f.size)) return;
      newItems.push({
        id: crypto.randomUUID(),
        name: f.name,
        size: f.size,
        file: f,
        status: 'pending',
      });
    });
    if (newItems.length > 0) {
      setFiles((curr) => [...curr, ...newItems]);
      showToast(`Added ${newItems.length} file(s) to queue.`);
    }
  }

  async function analyzeFile(id: string) {
    const item = files.find((f) => f.id === id);
    if (!item || item.status === 'processing') return;

    if (item.size > 16 * 1024 * 1024) {
      setFiles((curr) => curr.map((f) => f.id === id ? { ...f, status: 'failed', error: 'File is larger than 16 MB.' } : f));
      return;
    }

    setFiles((curr) => curr.map((f) => f.id === id ? { ...f, status: 'processing', error: undefined } : f));

    try {
      const text = await item.file.text();
      const rows = parseCSV(text);
      if (rows.length < 2) throw new Error('No data rows found in CSV.');
      
      const record = buildRecord({ name: item.name, size: item.size }, rows);
      
      const existing = localStorage.getItem(STORAGE_KEY);
      const datasets: DatasetRecord[] = existing ? JSON.parse(existing) : [];
      const filtered = datasets.filter((d) => d.table_name !== record.table_name);
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...filtered, record]));

      setFiles((curr) => curr.map((f) => f.id === id ? { ...f, status: 'completed', context: record, icon: record.icon } : f));
      setOpenContexts((curr) => ({ ...curr, [id]: true }));
      showToast(`${item.name} analyzed successfully.`);
    } catch (err) {
      setFiles((curr) => curr.map((f) => f.id === id ? { ...f, status: 'failed', error: err instanceof Error ? err.message : 'Analysis failed' } : f));
    }
  }

  function removeFile(id: string) {
    const item = files.find((f) => f.id === id);
    if (item && item.context) {
      try {
        const existing = localStorage.getItem(STORAGE_KEY);
        if (existing) {
          const datasets: DatasetRecord[] = JSON.parse(existing);
          const filtered = datasets.filter((d) => d.table_name !== item.context?.table_name);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
        }
      } catch {
        // ignore
      }
    }
    setFiles((curr) => curr.filter((f) => f.id !== id));
    showToast('Removed file from queue.');
  }

  const completedCount = files.filter((f) => f.status === 'completed').length;

  function loadSamples() {
    const sampleOrders = 'order_id,ordered_at,customer_id,sku,items,subtotal,shipping,total,status\n10401,2024-01-05,C-1042,SKU-DM-01,3,84.00,5.88,89.88,completed\n10402,2024-01-19,C-0311,SKU-CK-02,1,29.00,1.74,30.74,completed\n10403,2024-02-14,C-2210,SKU-LP-03,4,132.50,8.35,140.85,completed';
    const sampleCust = 'customer_id,joined_at,name,city,segment,lifetime_value\nC-0087,2023-02-14,Dana Whitfield,Chicago,repeat,412.60\nC-0311,2023-05-02,Marcus Oyelaran,Austin,new,30.74';
    const sampleProd = 'sku,name,category,cost,price,stock\nSKU-DM-01,Merino Desk Mat,desk,22.40,42.00,58\nSKU-CK-02,Cable Organization Kit,accessories,11.80,29.00,142';

    const samples = [
      { name: 'orders.csv', csv: sampleOrders },
      { name: 'customers.csv', csv: sampleCust },
      { name: 'products.csv', csv: sampleProd },
    ];

    const newItems: QueueItem[] = samples.map((s) => ({
      id: crypto.randomUUID(),
      name: s.name,
      size: s.csv.length,
      file: new File([s.csv], s.name, { type: 'text/csv' }),
      status: 'pending',
    }));

    setFiles((curr) => [...curr, ...newItems]);
    showToast('Sample datasets loaded into queue.');
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        :root{
          --paper:#F5F3ED; --surface:#FBFAF6; --surface-2:#FDFCF8;
          --ink:#1F231D; --ink-2:#4E5349; --ink-3:#8B8F82;
          --line:#E2DED2; --line-2:#D2CDC0;
          --sage:#5F7355; --sage-deep:#33463A; --sage-mid:#8FA07E; --sage-pale:#E9EEDD;
          --clay-deep:#9C5B33;
          --serif:'Fraunces',Georgia,serif; --sans:'Instrument Sans',sans-serif; --mono:'Spline Sans Mono',ui-monospace,monospace;
        }
        *{margin:0;padding:0;box-sizing:border-box}
        body{font:400 16px/1.6 var(--sans);background:var(--paper);color:var(--ink);-webkit-font-smoothing:antialiased;overflow-x:hidden}
        body::after{content:"";position:fixed;inset:0;z-index:200;pointer-events:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.12 0 0 0 0 0.13 0 0 0 0 0.10 0 0 0 0.05 0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E")}
        ::selection{background:#D8E0C8}
        :focus-visible{outline:2px solid #6B7F5C;outline-offset:2px;border-radius:4px}
        .container{max-width:1040px;margin:0 auto;padding:0 28px}
        h1,h2,h3{font-family:var(--serif);font-weight:500;letter-spacing:-.015em;color:var(--ink)}
        h1 em{font-style:italic;font-weight:500;color:var(--sage-deep)}
        .mono{font-family:var(--mono)}
        code{font:500 12px var(--mono);color:var(--sage-deep);background:var(--surface-2);border:1px solid var(--line);border-radius:5px;padding:1px 6px;white-space:nowrap}
        svg{display:block}
        button{font-family:var(--sans)}

        .btn{display:inline-flex;align-items:center;gap:10px;font:500 15px/1 var(--sans);border-radius:999px;padding:15px 28px;cursor:pointer;border:1px solid transparent;text-decoration:none;transition:background .25s ease,border-color .25s ease,transform .25s ease,color .25s ease}
        .btn svg{width:15px;height:15px;transition:transform .25s ease}
        .btn-primary{background:var(--sage-deep);color:#F4F2E9}
        .btn-primary:hover{background:#28392E;transform:translateY(-1px)}
        .btn-primary:hover svg{transform:translateX(3px)}
        .btn-ghost{color:var(--sage-deep);border-color:#CFC9B8;background:transparent}
        .btn-ghost:hover{border-color:var(--sage);background:#EFEDE2}
        .btn-small{padding:11px 20px;font-size:14px}
        .link-btn{background:none;border:none;padding:0;font:inherit;font-size:inherit;color:var(--sage-deep);text-decoration:underline;text-underline-offset:3px;cursor:pointer}
        .link-btn:hover{color:var(--ink)}
        .icon-btn{width:34px;height:34px;flex:none;border-radius:50%;border:1px solid var(--line);background:transparent;color:var(--ink-2);display:grid;place-items:center;cursor:pointer;transition:background .2s,border-color .2s,color .2s}
        .icon-btn:hover{background:#EFEDE2;border-color:var(--line-2);color:var(--ink)}
        .icon-btn svg{width:13px;height:13px}
        .icon-btn.sm{width:30px;height:30px}

        .kicker{font:500 12px var(--mono);letter-spacing:.18em;text-transform:uppercase;color:#6B7A5E}
        .lede{margin-top:22px;max-width:600px;font-size:17px;line-height:1.68;color:var(--ink-2)}

        .topbar{position:sticky;top:0;z-index:50;background:rgba(245,243,237,.86);backdrop-filter:blur(12px) saturate(1.2);border-bottom:1px solid var(--line)}
        .topbar-inner{max-width:1040px;margin:0 auto;padding:14px 28px;display:flex;align-items:center;gap:30px}
        .brand{display:flex;align-items:center;gap:10px;color:var(--sage-deep);text-decoration:none}
        .brand-mark{width:24px;height:24px}
        .brand-name{font:500 18px var(--serif);letter-spacing:-.01em}
        .brand-ctx{font:400 11px var(--mono);color:var(--ink-3);margin-left:2px;letter-spacing:.08em}
        .steps{display:flex;align-items:center;gap:14px;margin-left:4px}
        .st{display:inline-flex;align-items:center;gap:8px;font:500 12px var(--mono);letter-spacing:.08em;color:var(--ink-3)}
        .st-ic{display:inline-flex;justify-content:center;min-width:19px}
        .st-ic svg{width:12px;height:12px}
        .topbar-action{margin-left:auto}

        .view{padding-bottom:44px}
        .page-head{display:grid;grid-template-columns:1fr auto;align-items:end;gap:30px;padding:76px 0 46px}
        .page-title{font-size:clamp(2.4rem,4.4vw,3.5rem);line-height:1.06;letter-spacing:-.02em;margin-top:20px}

        .dropzone{border:1.5px dashed #C4BEAA;border-radius:16px;background:var(--surface);padding:56px 24px;text-align:center;cursor:pointer;transition:border-color .25s,background .25s}
        .dropzone:hover{border-color:var(--sage-mid)}
        .dz-icon{width:34px;height:34px;margin:0 auto 16px;color:var(--sage)}
        .dz-icon svg{width:34px;height:34px}
        .dz-title{font:500 17px var(--sans);color:var(--ink)}
        .dz-sub{font:500 10.5px var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--ink-3);margin:13px 0 17px}
        .dz-alt{margin-top:26px;font-size:13.5px;color:var(--ink-3)}
        .works-with{margin-top:20px;font-size:13.5px;color:var(--ink-3);display:flex;gap:7px;align-items:center;flex-wrap:wrap;line-height:1.9}
        .works-with .mono{font-size:12px;color:var(--ink-2);letter-spacing:.04em}

        .queue-panel{margin-top:44px;border:1px solid var(--line);border-radius:18px;background:var(--surface);overflow:hidden;box-shadow:0 1px 2px rgba(31,35,29,.04),0 28px 56px -40px rgba(31,35,29,.22)}
        .panel-bar{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:14px 22px;border-bottom:1px solid var(--line);font:500 11px var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
        .panel-bar span{display:inline-flex;align-items:center;gap:9px}
        .panel-bar svg{width:14px;height:14px;color:var(--sage)}
        .q-list{list-style:none}
        .q-row{border-top:1px solid #EBE7DB;transition:background .2s}
        .q-row:first-child{border-top:none}
        .q-main{display:grid;grid-template-columns:30px 1fr auto;gap:16px;align-items:center;padding:18px 22px;position:relative}
        .q-ic{width:22px;height:22px;color:var(--ink-3);display:grid;place-items:center}
        .q-row.st-completed .q-ic{color:var(--sage-deep)}
        .q-file{min-width:0}
        .q-name{display:block;font:500 14px var(--mono);color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .q-meta{display:block;margin-top:3px;font:400 11px var(--mono);color:var(--ink-3)}
        .q-status{display:flex;align-items:center;gap:12px}
        .spinner{width:18px;height:18px;flex:none;border-radius:50%;border:1.5px dashed var(--sage);animation:spin 2.2s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}
        .pill{display:inline-flex;align-items:center;gap:7px;font:500 10.5px var(--mono);letter-spacing:.1em;text-transform:uppercase;border-radius:6px;padding:6px 10px}
        .pill svg{width:11px;height:11px}
        .pill .chev{transition:transform .35s ease}
        .q-row.open .pill .chev{transform:rotate(180deg)}
        .pill-ready{color:var(--ink-3);border:1px solid var(--line)}
        .pill-done{color:#3E4A38;background:var(--sage-pale)}
        .pill-fail{color:var(--clay-deep);background:#F6E9DD}
        .pill-btn{border:none;cursor:pointer;background:none}

        .ctx{margin:2px 22px 24px 68px;border-left:2px solid var(--sage-mid);padding-left:20px}
        .ctx-kicker{display:flex;align-items:center;gap:8px;font:500 10.5px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3)}
        .ctx-kicker svg{width:12px;height:12px;color:var(--sage);flex:none}
        .ctx-head{display:flex;align-items:baseline;gap:14px;margin-top:10px;flex-wrap:wrap}
        .ctx-head h3{font-size:22px}
        .ctx-table{font:400 11px var(--mono);color:var(--ink-3)}
        .ctx-desc{margin-top:8px;font-size:14.5px;line-height:1.6;color:var(--ink-2);max-width:640px}
        .ctx-stats{margin-top:10px;font:400 11.5px var(--mono);color:var(--ink-3)}
        .q-err{display:flex;gap:9px;align-items:flex-start;margin:2px 22px 22px 68px;font-size:13.5px;line-height:1.5;color:var(--clay-deep)}
        .q-err svg{width:15px;height:15px;flex:none;margin-top:2px}

        .dict{margin-top:14px;max-width:660px}
        .dict-row{display:grid;grid-template-columns:158px 1fr;gap:14px;padding:8px 0;border-top:1px solid #EDE9DD}
        .dict-row:first-child{border-top:none}
        .dict-name{font:500 12.5px var(--mono);color:var(--sage-deep);word-break:break-all}
        .dict-mean{font-size:13px;color:var(--ink-2);line-height:1.55}
        .dict-stat{font:400 11px var(--mono);color:var(--ink-3)}

        .continue-row{margin-top:38px;display:flex;align-items:center;gap:18px;flex-wrap:wrap}
        .continue-note{font:400 12px var(--mono);color:var(--ink-3)}
        .privacy-note{margin-top:56px;padding-top:18px;border-top:1px solid var(--line);display:flex;gap:9px;align-items:center;font:400 12px var(--mono);color:var(--ink-3)}
        .privacy-note svg{width:14px;height:14px;color:var(--sage);flex:none}

        .site-foot{border-top:1px solid var(--line);margin-top:80px;padding:26px 0 36px}
        .foot-inner{display:flex;justify-content:space-between;align-items:center;gap:18px;flex-wrap:wrap}
        .foot-right{font:400 11.5px var(--mono);color:var(--ink-3)}

        .toast{position:fixed;bottom:28px;left:50%;transform:translate(-50%,16px);z-index:300;background:#242B22;color:#F1EFE5;border-radius:999px;padding:13px 22px;display:flex;align-items:center;gap:10px;font-size:14px;box-shadow:0 18px 40px -14px rgba(20,24,18,.55);opacity:0;visibility:hidden;transition:opacity .35s ease,transform .35s ease,visibility .35s;max-width:min(92vw,560px)}
        .toast.show{opacity:1;visibility:visible;transform:translate(-50%,0)}
        .toast svg{width:15px;height:15px;color:#B9C7A6;flex:none}
      `}} />

      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="/" aria-label="MerchMind home">
            <svg className="brand-mark" viewBox="0 0 26 26" aria-hidden="true">
              <circle cx="13" cy="13" r="11.2" fill="none" stroke="currentColor" strokeWidth="1.4" opacity=".5"/>
              <path d="M13 6.6 7.4 16.2M13 6.6l5.6 9.6M7.4 16.2h11.2" stroke="currentColor" strokeWidth="1.1" fill="none" opacity=".8"/>
              <circle cx="13" cy="6.6" r="2.1" fill="currentColor"/><circle cx="7.4" cy="16.2" r="2.1" fill="currentColor"/><circle cx="18.6" cy="16.2" r="2.1" fill="currentColor"/>
            </svg>
            <span className="brand-name">MerchMind</span>
            <span className="brand-ctx">/ upload</span>
          </a>
          <div className="steps" aria-hidden="true">
            <span className="st active">
              <span className="st-ic">01</span>Upload
            </span>
          </div>
          {completedCount > 0 && (
            <button className="btn btn-ghost btn-small topbar-action" onClick={() => router.push('/dashboard')}>
              Open Dashboard →
            </button>
          )}
        </div>
      </header>

      <main>
        <section className="view">
          <div className="container">
            <div className="page-head">
              <div>
                <p className="kicker">Workspace · step 01 of 03</p>
                <h1 className="page-title">Upload your <em>business data</em></h1>
                <p className="lede">Add the CSV files you already export — orders, customers, products — and confirm each one when you are ready. MerchMind profiles every dataset and links them into one connected workspace.</p>
              </div>
              {completedCount > 0 && (
                <button className="btn btn-ghost" onClick={() => router.push('/dashboard')}>
                  Open Dashboard →
                </button>
              )}
            </div>

            <div>
              <div 
                className="dropzone" 
                tabIndex={0} 
                role="button" 
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
                }}
              >
                <div className="dz-icon">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 12.5V3.5m0 0L4.5 7M8 3.5 11.5 7"/><path d="M2.5 13.5h11"/></svg>
                </div>
                <p className="dz-title">Drag &amp; drop CSV files here</p>
                <p className="dz-sub">multiple files welcome</p>
                <button className="btn btn-primary btn-small" type="button">Browse files</button>
                <p className="dz-alt">No files handy? <button className="link-btn" type="button" onClick={(e) => { e.stopPropagation(); loadSamples(); }}>Load sample datasets</button></p>
                <input 
                  ref={fileInputRef} 
                  type="file" 
                  accept=".csv,text/csv" 
                  multiple 
                  style={{ display: 'none' }} 
                  onChange={(e) => {
                    if (e.target.files) handleFiles(e.target.files);
                    e.target.value = '';
                  }} 
                />
              </div>
              <p className="works-with">Works well with
                <span className="mono">orders</span>·
                <span className="mono">customers</span>·
                <span className="mono">products</span>·
                <span className="mono">transactions</span>·
                <span className="mono">returns</span> — or any CSV you export.
              </p>
            </div>

            {files.length > 0 && (
              <div className="queue-panel">
                <div className="panel-bar">
                  <span>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden="true"><path d="M1.8 3.6h4.4l1.4 1.9h6.6v7H1.8z"/></svg>
                    Upload queue
                  </span>
                  <span>{files.length} file{files.length === 1 ? '' : 's'} · {completedCount} analyzed</span>
                </div>
                <ul className="q-list">
                  {files.map((item) => {
                    const isOpen = openContexts[item.id];
                    return (
                      <li key={item.id} className={`q-row st-${item.status} ${isOpen ? 'open' : ''}`}>
                        <div className="q-main">
                          <span className="q-ic" dangerouslySetInnerHTML={{ __html: ICONS[item.icon || 'file'] }} />
                          <div className="q-file">
                            <span className="q-name">{item.name}</span>
                            <span className="q-meta">{(item.size / 1024).toFixed(1)} KB · {item.status === 'completed' ? `${item.context?.row_count} rows` : item.status}</span>
                          </div>
                          <div className="q-status">
                            {item.status === 'pending' && (
                              <>
                                <span className="pill pill-ready">Ready</span>
                                <button className="btn btn-primary btn-small" type="button" onClick={() => analyzeFile(item.id)}>Confirm &amp; Analyze</button>
                                <button className="icon-btn sm" type="button" onClick={() => removeFile(item.id)}><span dangerouslySetInnerHTML={{ __html: ICONS.x }} /></button>
                              </>
                            )}
                            {item.status === 'processing' && (
                              <div className="flex items-center gap-2">
                                <div className="spinner" />
                                <span className="text-sm">Analyzing...</span>
                              </div>
                            )}
                            {item.status === 'completed' && (
                              <>
                                <button 
                                  className="pill pill-done pill-btn" 
                                  type="button" 
                                  onClick={() => setOpenContexts((curr) => ({ ...curr, [item.id]: !curr[item.id] }))}
                                >
                                  <span dangerouslySetInnerHTML={{ __html: ICONS.check }} /> Analyzed <span dangerouslySetInnerHTML={{ __html: ICONS.chev }} />
                                </button>
                                <button className="icon-btn sm" type="button" onClick={() => removeFile(item.id)}><span dangerouslySetInnerHTML={{ __html: ICONS.x }} /></button>
                              </>
                            )}
                            {item.status === 'failed' && (
                              <>
                                <span className="pill pill-fail">Failed</span>
                                <button className="btn btn-ghost btn-small" type="button" onClick={() => analyzeFile(item.id)}>Retry</button>
                                <button className="icon-btn sm" type="button" onClick={() => removeFile(item.id)}><span dangerouslySetInnerHTML={{ __html: ICONS.x }} /></button>
                              </>
                            )}
                          </div>
                        </div>

                        {item.status === 'completed' && item.context && isOpen && (
                          <div className="ctx">
                            <p className="ctx-kicker"><span dangerouslySetInnerHTML={{ __html: ICONS.check }} /> Semantic context — understood automatically</p>
                            <div className="ctx-head">
                              <h3>{item.context.semantic_object.entity}</h3>
                              <span className="ctx-table">table <code>{item.context.table_name}</code></span>
                            </div>
                            <p className="ctx-desc">{item.context.semantic_object.description}</p>
                            <p className="ctx-stats">{item.context.row_count.toLocaleString('en-US')} rows · {item.context.columns.length} columns</p>
                            <div className="dict">
                              {item.context.columns.slice(0, expandedCols[item.id] ? undefined : 6).map((c, idx) => (
                                <div key={idx} className="dict-row">
                                  <span className="dict-name">{c.name}</span>
                                  <span className="dict-mean">{c.meaning} {c.stat ? <span className="dict-stat">· {c.stat}</span> : null}</span>
                                </div>
                              ))}
                              {item.context.columns.length > 6 && !expandedCols[item.id] && (
                                <button className="link-btn dict-more" type="button" onClick={() => setExpandedCols((curr) => ({ ...curr, [item.id]: true }))}>
                                  +{item.context.columns.length - 6} more columns
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        {item.status === 'failed' && item.error && (
                          <div className="q-err">
                            <span dangerouslySetInnerHTML={{ __html: ICONS.warn }} />
                            <span>{item.error}</span>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {completedCount > 0 && (
              <div className="continue-row">
                <button className="btn btn-primary" type="button" onClick={() => router.push('/dashboard')}>
                  Continue to Dashboard →
                </button>
                <span className="continue-note">…or keep adding files.</span>
              </div>
            )}

            <p className="privacy-note">
              <span dangerouslySetInnerHTML={{ __html: ICONS.lock }} /> Analysis runs entirely in your browser.
            </p>
          </div>
        </section>
      </main>

      <footer className="site-foot">
        <div className="container foot-inner">
          <div className="brand" style={{ color: 'var(--sage-deep)' }}>
            <span className="brand-name">MerchMind</span>
          </div>
          <p className="foot-right">© {new Date().getFullYear()} MerchMind — AI merchant intelligence</p>
        </div>
      </footer>

      <div className={`toast ${toastMessage ? 'show' : ''}`} role="status" aria-live="polite">
        <span dangerouslySetInnerHTML={{ __html: ICONS.spark }} />
        <span>{toastMessage}</span>
      </div>
    </>
  );
}