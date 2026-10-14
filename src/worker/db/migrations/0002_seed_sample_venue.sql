-- Sample venue so a fresh room can take orders. Menu, tables and staff are
-- replaced from the manager console; the sample staff has no PIN.
INSERT INTO `meta` (`key`, `value`) VALUES
  ('service_day', date('now', '+7 hours')),
  ('service_open', '1'),
  ('ticket_counter', '0'),
  ('retention_orders_days', '90'),
  ('retention_audit_days', '180');
--> statement-breakpoint
INSERT INTO `menu_items` (`id`, `name`, `price_idr`, `category`, `sort`, `modifier_groups_json`, `updated_at`) VALUES
  ('nasi-goreng-kampung', 'Nasi Goreng Kampung', 42000, 'Makanan', 1, '[{"id":"pedas","name":"Level pedas","required":true,"multi":false,"options":[{"id":"tidak-pedas","name":"Tidak pedas","priceDeltaIdr":0},{"id":"pedas-sedang","name":"Pedas sedang","priceDeltaIdr":0},{"id":"extra-pedas","name":"Extra pedas","priceDeltaIdr":0}]},{"id":"tambahan","name":"Tambahan","required":false,"multi":true,"options":[{"id":"telur-ceplok","name":"Telur ceplok","priceDeltaIdr":5000},{"id":"tanpa-bawang","name":"Tanpa bawang","priceDeltaIdr":0}]}]', unixepoch() * 1000),
  ('ayam-bakar-madu', 'Ayam Bakar Madu', 56000, 'Makanan', 2, '[{"id":"sambal","name":"Sambal","required":false,"multi":false,"options":[{"id":"sambal-terpisah","name":"Sambal terpisah","priceDeltaIdr":0},{"id":"tanpa-sambal","name":"Tanpa sambal","priceDeltaIdr":0}]},{"id":"nasi","name":"Nasi","required":false,"multi":false,"options":[{"id":"nasi-setengah","name":"Nasi setengah","priceDeltaIdr":0},{"id":"nasi-tambah","name":"Tambah nasi","priceDeltaIdr":6000}]}]', unixepoch() * 1000),
  ('mie-goreng-jawa', 'Mie Goreng Jawa', 38000, 'Makanan', 3, '[{"id":"pedas","name":"Level pedas","required":true,"multi":false,"options":[{"id":"tidak-pedas","name":"Tidak pedas","priceDeltaIdr":0},{"id":"pedas-sedang","name":"Pedas sedang","priceDeltaIdr":0},{"id":"extra-pedas","name":"Extra pedas","priceDeltaIdr":0}]}]', unixepoch() * 1000),
  ('sate-ayam', 'Sate Ayam', 48000, 'Makanan', 4, '[{"id":"saus","name":"Saus","required":false,"multi":false,"options":[{"id":"saus-terpisah","name":"Saus terpisah","priceDeltaIdr":0}]},{"id":"lontong","name":"Lontong","required":false,"multi":false,"options":[{"id":"tanpa-lontong","name":"Tanpa lontong","priceDeltaIdr":0}]}]', unixepoch() * 1000),
  ('soto-ayam', 'Soto Ayam', 35000, 'Makanan', 5, '[{"id":"tambahan","name":"Tambahan","required":false,"multi":true,"options":[{"id":"tanpa-seledri","name":"Tanpa seledri","priceDeltaIdr":0},{"id":"telur-rebus","name":"Telur rebus","priceDeltaIdr":4000}]}]', unixepoch() * 1000),
  ('kentang-goreng', 'Kentang Goreng', 24000, 'Camilan', 6, '[{"id":"saus","name":"Saus","required":false,"multi":false,"options":[{"id":"saus-terpisah","name":"Saus terpisah","priceDeltaIdr":0},{"id":"tanpa-saus","name":"Tanpa saus","priceDeltaIdr":0}]}]', unixepoch() * 1000),
  ('tahu-crispy', 'Tahu Crispy', 22000, 'Camilan', 7, '[{"id":"sambal","name":"Sambal","required":false,"multi":false,"options":[{"id":"sambal-terpisah","name":"Sambal terpisah","priceDeltaIdr":0},{"id":"tanpa-sambal","name":"Tanpa sambal","priceDeltaIdr":0}]}]', unixepoch() * 1000),
  ('pisang-goreng', 'Pisang Goreng', 20000, 'Camilan', 8, '[]', unixepoch() * 1000),
  ('es-teh-lemon', 'Es Teh Lemon', 18000, 'Minuman', 9, '[{"id":"gula","name":"Gula","required":false,"multi":false,"options":[{"id":"sedikit-gula","name":"Sedikit gula","priceDeltaIdr":0},{"id":"tanpa-gula","name":"Tanpa gula","priceDeltaIdr":0}]},{"id":"es","name":"Es","required":false,"multi":false,"options":[{"id":"tanpa-es","name":"Tanpa es","priceDeltaIdr":0}]}]', unixepoch() * 1000),
  ('kopi-susu-aren', 'Kopi Susu Aren', 26000, 'Minuman', 10, '[{"id":"suhu","name":"Suhu","required":true,"multi":false,"options":[{"id":"dingin","name":"Dingin","priceDeltaIdr":0},{"id":"panas","name":"Panas","priceDeltaIdr":0}]},{"id":"gula","name":"Gula","required":false,"multi":false,"options":[{"id":"sedikit-gula","name":"Sedikit gula","priceDeltaIdr":0}]}]', unixepoch() * 1000),
  ('jus-jeruk', 'Jus Jeruk', 24000, 'Minuman', 11, '[{"id":"gula","name":"Gula","required":false,"multi":false,"options":[{"id":"tanpa-gula","name":"Tanpa gula","priceDeltaIdr":0}]},{"id":"es","name":"Es","required":false,"multi":false,"options":[{"id":"tanpa-es","name":"Tanpa es","priceDeltaIdr":0}]}]', unixepoch() * 1000),
  ('air-mineral', 'Air Mineral', 8000, 'Minuman', 12, '[]', unixepoch() * 1000);
--> statement-breakpoint
INSERT INTO `tables` (`id`, `label`, `sort`) VALUES
  ('t01', 'Meja 1', 1), ('t02', 'Meja 2', 2), ('t03', 'Meja 3', 3),
  ('t04', 'Meja 4', 4), ('t05', 'Meja 5', 5), ('t06', 'Meja 6', 6),
  ('t07', 'Meja 7', 7), ('t08', 'Meja 8', 8), ('t09', 'Meja 9', 9),
  ('t10', 'Meja 10', 10), ('t11', 'Meja 11', 11), ('t12', 'Meja 12', 12),
  ('t13', 'Meja 13', 13), ('t14', 'Meja 14', 14), ('t15', 'Meja 15', 15);
--> statement-breakpoint
INSERT INTO `staff` (`id`, `name`, `role`) VALUES
  ('sample-waiter', 'Staf Contoh', 'waiter');
