-- Jalankan di Supabase > SQL Editor
create table if not exists produk (id text primary key, data jsonb not null, created_at timestamptz default now());
create table if not exists trx   (like produk including all);
create table if not exists nota  (like produk including all);

alter table produk enable row level security;
alter table trx    enable row level security;
alter table nota   enable row level security;
create policy "akses produk" on produk for all to anon using (true) with check (true);
create policy "akses trx"    on trx    for all to anon using (true) with check (true);
create policy "akses nota"   on nota   for all to anon using (true) with check (true);

alter publication supabase_realtime add table produk, trx, nota;

insert into produk (id, data) values
 ('p1', '{"nama":"Indomie Goreng","harga":3500}'),
 ('p2', '{"nama":"Aqua 600ml","harga":4000}'),
 ('p3', '{"nama":"Teh Botol","harga":5500}')
on conflict do nothing;
