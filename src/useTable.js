import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './supabase'

// Sinkron satu tabel Supabase ke array di React. Web & app memakai tabel yang sama,
// perubahan dari perangkat lain masuk otomatis lewat realtime.
export function useTable(table) {
  const [rows, setRows] = useState([])
  const ref = useRef([])

  const load = useCallback(async () => {
    const { data, error } = await supabase.from(table).select('id,data').order('created_at')
    if (error) return console.error(table, error.message)
    const r = data.map(x => ({ ...x.data, id: x.id }))
    ref.current = r
    setRows(r)
  }, [table])

  useEffect(() => {
    load()
    const ch = supabase.channel('rt-' + table)
      .on('postgres_changes', { event: '*', schema: 'public', table }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load, table])

  const set = useCallback(fn => {
    const old = ref.current
    const next = typeof fn === 'function' ? fn(old) : fn
    ref.current = next
    setRows(next)
    const before = new Map(old.map(r => [r.id, JSON.stringify(r)]))
    const up = next.filter(r => before.get(r.id) !== JSON.stringify(r)).map(({ id, ...data }) => ({ id, data }))
    const del = old.filter(r => !next.some(n => n.id === r.id)).map(r => r.id)
    const log = ({ error }) => error && console.error(table, error.message)
    if (up.length) supabase.from(table).upsert(up).then(log)
    if (del.length) supabase.from(table).delete().in('id', del).then(log)
  }, [table])

  return [rows, set]
}
