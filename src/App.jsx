import { useState, useEffect, useRef } from 'react'
import { useTable } from './useTable'

const rp = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID')
const tgl = t => new Date(t).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
const saldo = c => c.entri.reduce((s, e) => s + (e.tipe === 'utang' ? e.jumlah : -e.jumlah), 0)

const beep = () => {
  try { const a = new AudioContext(), o = a.createOscillator(); o.connect(a.destination); o.frequency.value = 1000; o.start(); o.stop(a.currentTime + 0.08) } catch { /* tanpa suara */ }
}
async function cariNama(code) {
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name`)
    const j = await r.json()
    return j.status === 1 ? j.product.product_name || '' : ''
  } catch { return '' }
}

function Scanner({ onCode, info, onClose }) {
  const vid = useRef(null), cb = useRef(onCode), last = useRef({ c: '', t: 0 })
  const [err, setErr] = useState('')
  cb.current = onCode
  useEffect(() => {
    let ctl, dead = false
    import('@zxing/browser').then(({ BrowserMultiFormatReader }) =>
      new BrowserMultiFormatReader().decodeFromConstraints({ video: { facingMode: 'environment' } }, vid.current, r => {
        if (!r) return
        const c = r.getText(), now = Date.now()
        if (c === last.current.c && now - last.current.t < 2000) return
        last.current = { c, t: now }
        cb.current(c)
      })
    ).then(x => { if (dead) x.stop(); else ctl = x })
      .catch(() => setErr('Kamera tidak bisa dibuka. Izinkan akses kamera (perlu HTTPS) atau pakai scanner USB.'))
    return () => { dead = true; if (ctl) ctl.stop() }
  }, [])
  return (
    <div className="overlay">
      <div className="struk scan">
        <video ref={vid} playsInline muted />
        <p className="c">{err || info || 'Arahkan kamera ke barcode'}</p>
        <div className="btns"><button onClick={onClose}>Selesai</button></div>
      </div>
    </div>
  )
}

function Struk({ judul, sub, rows, total, label = 'TOTAL', extra, onClose }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="struk" onClick={e => e.stopPropagation()}>
        <div id="print">
          <h3>WARUNG RIDHO</h3>
          <p className="c">{judul}</p>
          <p className="c">{sub}</p>
          <hr />
          {rows.map((r, i) => (
            <div className="row" key={i}><span>{r[0]}</span><span>{r[1]}</span></div>
          ))}
          <hr />
          <div className="row b"><span>{label}</span><span>{rp(total)}</span></div>
          {extra}
          <hr />
          <p className="c">Terima kasih</p>
        </div>
        <div className="btns">
          <button onClick={() => window.print()}>Cetak</button>
          <button className="g" onClick={onClose}>Tutup</button>
        </div>
      </div>
    </div>
  )
}

function StrukTrx({ t, onClose }) {
  const rows = t.items.map(i => [`${i.nama}\n${i.qty} x ${i.harga.toLocaleString('id-ID')}`, rp(i.qty * i.harga)])
  const extra = t.mode === 'tunai'
    ? <><div className="row"><span>Tunai</span><span>{rp(t.bayar)}</span></div><div className="row"><span>Kembali</span><span>{rp(t.kembali)}</span></div></>
    : <div className="row"><span>Dicatat utang: {t.pelanggan}</span><span /></div>
  return <Struk judul={`No. ${t.id.slice(-6).toUpperCase()}`} sub={tgl(t.waktu)} rows={rows} total={t.total} extra={extra} onClose={onClose} />
}

function Kasir({ produk, nota, setNota, addTrx, onUnknown }) {
  const [q, setQ] = useState('')
  const [cart, setCart] = useState({})
  const [mode, setMode] = useState('tunai')
  const [bayar, setBayar] = useState('')
  const [cust, setCust] = useState('')
  const [struk, setStruk] = useState(null)
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')
  const [unk, setUnk] = useState('')
  const [scan, setScan] = useState(false)
  const bcRef = useRef(null)

  const items = produk.filter(p => cart[p.id]).map(p => ({ ...p, qty: cart[p.id] }))
  const total = items.reduce((s, i) => s + i.harga * i.qty, 0)
  const kembali = Number(bayar || 0) - total
  const ok = total > 0 && (mode === 'tunai' ? kembali >= 0 : cust.trim() !== '')
  const ch = (id, d) => setCart(c => {
    const n = (c[id] || 0) + d, x = { ...c }
    if (n > 0) x[id] = n; else delete x[id]
    return x
  })
  const cari = c => {
    const p = produk.find(x => x.barcode === c)
    if (p) { ch(p.id, 1); setMsg('+ ' + p.nama); setUnk(''); beep() } else { setMsg(''); setUnk(c) }
  }
  const kode = () => { const c = code.trim(); setCode(''); if (c) cari(c) }

  const selesai = () => {
    const nm = cust.trim()
    const t = {
      id: uid(), waktu: Date.now(), total, mode,
      items: items.map(({ nama, harga, qty }) => ({ nama, harga, qty })),
      bayar: mode === 'tunai' ? Number(bayar) : 0,
      kembali: mode === 'tunai' ? kembali : 0,
      pelanggan: mode === 'utang' ? nm : '',
    }
    addTrx(t)
    if (mode === 'utang') {
      const e = { id: uid(), waktu: t.waktu, tipe: 'utang', jumlah: total, ket: 'Belanja: ' + items.map(i => `${i.nama} x${i.qty}`).join(', ') }
      setNota(n => {
        const f = n.find(x => x.nama.toLowerCase() === nm.toLowerCase())
        return f ? n.map(x => x === f ? { ...x, entri: [...x.entri, e] } : x) : [...n, { id: uid(), nama: nm, entri: [e] }]
      })
    }
    setStruk(t); setCart({}); setBayar(''); setCust('')
  }

  return (
    <div className="split">
      <section>
        <form className="add" onSubmit={e => { e.preventDefault(); kode() }}>
          <input ref={bcRef} autoFocus placeholder="Scan / ketik barcode, lalu Enter" value={code} onChange={e => setCode(e.target.value)} />
          <button type="button" onClick={() => setScan(true)}>Kamera</button>
        </form>
        {msg && <p className="muted">{msg}</p>}
        {unk && <div className="warn"><span>Barcode {unk} belum terdaftar.</span><button onClick={() => onUnknown(unk)}>Tambah produk baru</button></div>}
        <input className="full" placeholder="Cari produk..." value={q} onChange={e => setQ(e.target.value)} />
        <div className="grid">
          {produk.filter(p => p.nama.toLowerCase().includes(q.toLowerCase())).map(p => (
            <button key={p.id} className="item" onClick={() => { ch(p.id, 1); if (bcRef.current) bcRef.current.focus() }}>
              <b>{p.nama}</b><span>{rp(p.harga)}</span>
            </button>
          ))}
          {produk.length === 0 && <p className="muted">Belum ada produk. Tambahkan di tab Produk.</p>}
        </div>
      </section>
      <aside className="panel">
        <h2>Keranjang</h2>
        {items.length === 0 && <p className="muted">Klik produk untuk menambahkan.</p>}
        {items.map(i => (
          <div className="line" key={i.id}>
            <div><b>{i.nama}</b><small>{rp(i.harga)}</small></div>
            <div className="qty">
              <button onClick={() => ch(i.id, -1)}>−</button><span>{i.qty}</span><button onClick={() => ch(i.id, 1)}>+</button>
            </div>
            <b>{rp(i.harga * i.qty)}</b>
          </div>
        ))}
        <div className="total"><span>Total</span><b>{rp(total)}</b></div>
        <div className="seg">
          <button className={mode === 'tunai' ? 'on' : ''} onClick={() => setMode('tunai')}>Tunai</button>
          <button className={mode === 'utang' ? 'on' : ''} onClick={() => setMode('utang')}>Utang</button>
        </div>
        {mode === 'tunai' ? (
          <>
            <input className="full" type="number" placeholder="Uang diterima" value={bayar} onChange={e => setBayar(e.target.value)} />
            <div className="quick">
              <button onClick={() => setBayar(String(total))}>Pas</button>
              {[10000, 20000, 50000, 100000].map(n => <button key={n} onClick={() => setBayar(String(n))}>{n / 1000}rb</button>)}
            </div>
            <div className="row"><span>Kembalian</span><b className={kembali < 0 ? 'neg' : ''}>{rp(Math.max(kembali, 0))}</b></div>
          </>
        ) : (
          <>
            <input className="full" list="plg" placeholder="Nama pelanggan" value={cust} onChange={e => setCust(e.target.value)} />
            <datalist id="plg">{nota.map(c => <option key={c.id} value={c.nama} />)}</datalist>
          </>
        )}
        <button className="pay" disabled={!ok} onClick={selesai}>Selesai & cetak struk</button>
        {items.length > 0 && <button className="g full" onClick={() => setCart({})}>Kosongkan</button>}
      </aside>
      {struk && <StrukTrx t={struk} onClose={() => setStruk(null)} />}
      {scan && <Scanner onCode={cari} info={unk ? `Barcode ${unk} belum terdaftar` : msg} onClose={() => setScan(false)} />}
    </div>
  )
}

function Produk({ produk, setProduk, initCode, clearCode }) {
  const [nama, setNama] = useState('')
  const [harga, setHarga] = useState('')
  const [barcode, setBarcode] = useState('')
  const [scan, setScan] = useState(false)
  const [info, setInfo] = useState('')
  const isi = async c => {
    setBarcode(c)
    if (produk.some(p => p.barcode === c)) return setInfo('Barcode ini sudah terdaftar.')
    setInfo('Mencari nama produk...')
    const n = await cariNama(c)
    if (n) setNama(x => x || n)
    setInfo(n ? 'Nama terisi otomatis. Isi harganya.' : 'Nama tidak ditemukan. Isi nama dan harga.')
  }
  useEffect(() => { if (initCode) { isi(initCode); clearCode() } }, [initCode])
  const tambah = e => {
    e.preventDefault()
    const bc = barcode.trim()
    if (!nama.trim() || !harga) return
    if (bc && produk.some(p => p.barcode === bc)) return alert('Barcode sudah dipakai produk lain.')
    setProduk(p => [...p, { id: uid(), nama: nama.trim(), harga: Number(harga), barcode: bc }])
    setNama(''); setHarga(''); setBarcode(''); setInfo('')
  }
  const upd = (id, k, v) => setProduk(p => p.map(x => x.id === id ? { ...x, [k]: v } : x))
  return (
    <div className="panel wide">
      <h2>Produk</h2>
      <form className="add wrap" onSubmit={tambah}>
        <input placeholder="Barcode (scan / ketik, Enter)" value={barcode} onChange={e => setBarcode(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (barcode.trim()) isi(barcode.trim()) } }} />
        <button type="button" onClick={() => setScan(true)}>Scan kamera</button>
        <input placeholder="Nama produk" value={nama} onChange={e => setNama(e.target.value)} />
        <input type="number" placeholder="Harga" value={harga} onChange={e => setHarga(e.target.value)} />
        <button>Tambah produk</button>
      </form>
      {info && <p className="muted">{info}</p>}
      {produk.map(p => (
        <div className="add wrap" key={p.id}>
          <input value={p.nama} onChange={e => upd(p.id, 'nama', e.target.value)} />
          <input className="bc" placeholder="Barcode" value={p.barcode || ''} onChange={e => upd(p.id, 'barcode', e.target.value.trim())} />
          <input type="number" value={p.harga} onChange={e => upd(p.id, 'harga', Number(e.target.value))} />
          <button className="g" onClick={() => confirm(`Hapus ${p.nama}?`) && setProduk(a => a.filter(x => x.id !== p.id))}>Hapus</button>
        </div>
      ))}
      {scan && <Scanner info={info} onCode={c => { setScan(false); isi(c) }} onClose={() => setScan(false)} />}
    </div>
  )
}

function Riwayat({ trx, setTrx }) {
  const [sel, setSel] = useState(null)
  const hari = new Date().toDateString()
  const omzet = trx.filter(t => new Date(t.waktu).toDateString() === hari && t.mode === 'tunai').reduce((s, t) => s + t.total, 0)
  return (
    <div className="panel wide">
      <h2>Riwayat transaksi</h2>
      <p className="muted">Penjualan tunai hari ini: <b>{rp(omzet)}</b></p>
      {trx.length === 0 && <p className="muted">Belum ada transaksi.</p>}
      {[...trx].sort((a, b) => b.waktu - a.waktu).map(t => (
        <div className="line hist" key={t.id}>
          <div><b>No. {t.id.slice(-6).toUpperCase()}</b><small>{tgl(t.waktu)} · {t.items.length} jenis · {t.mode === 'utang' ? 'Utang: ' + t.pelanggan : 'Tunai'}</small></div>
          <b>{rp(t.total)}</b>
          <button onClick={() => setSel(t)}>Struk</button>
          <button className="g" onClick={() => confirm('Hapus transaksi ini?') && setTrx(a => a.filter(x => x.id !== t.id))}>Hapus</button>
        </div>
      ))}
      {sel && <StrukTrx t={sel} onClose={() => setSel(null)} />}
    </div>
  )
}

function Nota({ nota, setNota }) {
  const [sid, setSid] = useState(null)
  const [baru, setBaru] = useState('')
  const [jml, setJml] = useState('')
  const [ket, setKet] = useState('')
  const [struk, setStruk] = useState(false)
  const c = nota.find(x => x.id === sid) || null
  const upd = fn => setNota(n => n.map(x => x.id === sid ? fn(x) : x))
  const tambahPlg = e => {
    e.preventDefault()
    if (!baru.trim()) return
    const x = { id: uid(), nama: baru.trim(), entri: [] }
    setNota(n => [...n, x]); setSid(x.id); setBaru('')
  }
  const catat = tipe => {
    const j = Number(jml)
    if (!j) return
    upd(x => ({ ...x, entri: [...x.entri, { id: uid(), waktu: Date.now(), tipe, jumlah: j, ket: ket.trim() || (tipe === 'utang' ? 'Tambah utang' : 'Bayar utang') }] }))
    setJml(''); setKet('')
  }
  return (
    <div className="split">
      <section className="panel">
        <h2>Pelanggan</h2>
        <form className="add" onSubmit={tambahPlg}>
          <input placeholder="Nama pelanggan baru" value={baru} onChange={e => setBaru(e.target.value)} />
          <button>Tambah</button>
        </form>
        {nota.length === 0 && <p className="muted">Belum ada nota utang.</p>}
        {nota.map(x => (
          <button key={x.id} className={'cust' + (x.id === sid ? ' on' : '')} onClick={() => setSid(x.id)}>
            <span>{x.nama}</span><b className={saldo(x) > 0 ? 'neg' : ''}>{rp(saldo(x))}</b>
          </button>
        ))}
      </section>
      <aside className="panel">
        {!c ? <p className="muted">Pilih pelanggan untuk melihat nota.</p> : (
          <>
            <input className="full name" value={c.nama} onChange={e => upd(x => ({ ...x, nama: e.target.value }))} />
            <div className="display">
              <small>Sisa utang</small>
              <b>{rp(saldo(c))}</b>
            </div>
            <input className="full" type="number" placeholder="Jumlah (Rp)" value={jml} onChange={e => setJml(e.target.value)} />
            <input className="full" placeholder="Keterangan (opsional)" value={ket} onChange={e => setKet(e.target.value)} />
            <div className="seg">
              <button className="plus" onClick={() => catat('utang')}>+ Tambah utang</button>
              <button className="minus" onClick={() => catat('bayar')}>− Bayar</button>
            </div>
            {c.entri.map(e => (
              <div className="line" key={e.id}>
                <div><b>{e.ket}</b><small>{tgl(e.waktu)}</small></div>
                <input className="amt" type="number" value={e.jumlah} onChange={ev => upd(x => ({ ...x, entri: x.entri.map(y => y.id === e.id ? { ...y, jumlah: Number(ev.target.value) } : y) }))} />
                <b className={e.tipe === 'utang' ? 'neg' : 'pos'}>{e.tipe === 'utang' ? '+' : '−'}</b>
                <button className="g" onClick={() => upd(x => ({ ...x, entri: x.entri.filter(y => y.id !== e.id) }))}>×</button>
              </div>
            ))}
            <button className="pay" onClick={() => setStruk(true)}>Cetak struk utang</button>
            <button className="g full" onClick={() => confirm(`Hapus nota ${c.nama}?`) && (setNota(n => n.filter(x => x.id !== c.id)), setSid(null))}>Hapus pelanggan</button>
            {struk && (
              <Struk judul="STRUK UTANG" sub={`${c.nama} · ${tgl(Date.now())}`} label="SISA UTANG" total={saldo(c)} onClose={() => setStruk(false)}
                rows={c.entri.map(e => [`${e.ket}\n${tgl(e.waktu)}`, (e.tipe === 'utang' ? '+' : '−') + rp(e.jumlah)])} />
            )}
          </>
        )}
      </aside>
    </div>
  )
}

const ICON = {
  kasir: <><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 7H6" /></>,
  produk: <path d="M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8" />,
  riwayat: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  nota: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" />,
}
const Ico = ({ k }) => <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{ICON[k]}</svg>

export default function App() {
  const [tab, setTab] = useState('kasir')
  const [produk, setProduk] = useTable('produk')
  const [trx, setTrx] = useTable('trx')
  const [nota, setNota] = useTable('nota')
  const [newCode, setNewCode] = useState('')
  const tabs = [['kasir', 'Kasir'], ['produk', 'Produk'], ['riwayat', 'Riwayat'], ['nota', 'Nota utang']]
  const nav = cls => (
    <nav className={cls}>
      {tabs.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><Ico k={k} />{l}</button>)}
    </nav>
  )
  return (
    <>
      <header><h1>KASIR</h1>{nav('top')}</header>
      <main>
        {tab === 'kasir' && <Kasir produk={produk} nota={nota} setNota={setNota} addTrx={t => setTrx(a => [t, ...a])} onUnknown={c => { setNewCode(c); setTab('produk') }} />}
        {tab === 'produk' && <Produk produk={produk} setProduk={setProduk} initCode={newCode} clearCode={() => setNewCode('')} />}
        {tab === 'riwayat' && <Riwayat trx={trx} setTrx={setTrx} />}
        {tab === 'nota' && <Nota nota={nota} setNota={setNota} />}
      </main>
      {nav('bottom')}
    </>
  )
}
