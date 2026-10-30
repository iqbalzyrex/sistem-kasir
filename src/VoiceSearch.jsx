import { useState, useEffect, useRef, useMemo } from 'react'

const rp = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID')
const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null

// Kata perintah yang tidak ikut dicari, mis. "cari indomie goreng"
const FILLER = new Set(['cari', 'carikan', 'tolong', 'produk', 'barang', 'harga', 'berapa', 'ada', 'apa', 'yang', 'dong', 'ya', 'nya', 'tampilkan', 'lihat'])

const tokens = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)

function cocok(produk, teks) {
  const t = tokens(teks).filter(w => !FILLER.has(w))
  if (!t.length) return []
  return produk
    .map(p => {
      const nama = (p.nama || '').toLowerCase()
      const bc = p.barcode || ''
      const kena = t.filter(w => nama.includes(w) || bc.includes(w)).length
      const awal = nama.startsWith(t[0]) ? 1 : 0
      return { p, kena, awal }
    })
    .filter(x => x.kena > 0)
    .sort((a, b) => b.kena - a.kena || b.awal - a.awal || (a.p.nama || '').localeCompare(b.p.nama || '', 'id'))
    // utamakan produk yang cocok dengan SEMUA kata; kalau tidak ada, tampilkan yang sebagian
    .filter((x, _, arr) => x.kena === arr[0].kena)
    .map(x => x.p)
}

export default function VoiceSearch({ produk, loaded, onKelola }) {
  const [teks, setTeks] = useState('')
  const [dengar, setDengar] = useState(false)
  const [err, setErr] = useState('')
  const rec = useRef(null)
  const sudahCoba = useRef(false)

  const mulai = () => {
    if (!SR) return setErr('Browser ini belum mendukung pencarian suara. Ketik nama produk di kolom bawah.')
    if (rec.current) rec.current.abort()
    const r = new SR()
    r.lang = 'id-ID'
    r.interimResults = true
    r.continuous = false
    r.onstart = () => { setDengar(true); setErr('') }
    r.onresult = e => {
      let s = ''
      for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript
      setTeks(s)
    }
    r.onerror = e => {
      setDengar(false)
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setErr('Izin mikrofon ditolak. Izinkan akses mikrofon lalu tekan tombol mic.')
      else if (e.error === 'no-speech') setErr('Suara tidak terdengar. Tekan mic dan coba lagi.')
      else if (e.error !== 'aborted') setErr('Gagal mengenali suara (' + e.error + ').')
    }
    r.onend = () => setDengar(false)
    rec.current = r
    try { r.start() } catch { /* sudah berjalan */ }
  }
  const berhenti = () => rec.current && rec.current.stop()

  // Coba langsung mendengarkan saat halaman pertama dibuka.
  // Browser hanya mengizinkan ini bila mic sudah pernah diizinkan; kalau tidak, user tinggal tekan tombol mic.
  useEffect(() => {
    if (sudahCoba.current) return
    sudahCoba.current = true
    mulai()
    return () => { if (rec.current) rec.current.abort() }
  }, [])

  const hasil = useMemo(() => cocok(produk, teks), [produk, teks])
  const ada = teks.trim() !== ''

  return (
    <div className="panel wide voice">
      <div className="head">
        <h2>Cari produk dengan suara</h2>
        <button className="g" onClick={onKelola}>+ Tambah produk</button>
      </div>

      <div className="micwrap">
        <button className={'mic' + (dengar ? ' on' : '')} onClick={dengar ? berhenti : mulai} aria-label={dengar ? 'Berhenti mendengarkan' : 'Mulai bicara'} disabled={!SR}>
          <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />
          </svg>
        </button>
        <p className="muted c">{dengar ? 'Mendengarkan... sebutkan nama produk' : 'Tekan mic lalu sebut nama produk, mis. "indomie goreng"'}</p>
      </div>

      {err && <p className="neg c">{err}</p>}

      <input className="full" placeholder="Atau ketik nama / barcode produk..." value={teks} onChange={e => setTeks(e.target.value)} />

      <p className="muted">
        {!loaded ? 'Memuat produk...' : ada ? `Hasil untuk "${teks.trim()}": ${hasil.length} produk` : `${produk.length} produk tersedia`}
      </p>
      {loaded && ada && hasil.length === 0 && <p className="muted">Tidak ada produk yang cocok. Coba ucapkan lagi dengan lebih jelas.</p>}
      {hasil.map(p => (
        <div className="line" key={p.id}>
          <div><b>{p.nama}</b><small>{p.barcode ? 'Barcode ' + p.barcode : 'Tanpa barcode'}</small></div>
          <b className="hrg">{rp(p.harga)}</b>
        </div>
      ))}
    </div>
  )
}
