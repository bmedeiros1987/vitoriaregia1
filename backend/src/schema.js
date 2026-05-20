const { query, rowsOf } = require('./db');

async function run(sql) {
  await query(sql);
}

async function initDatabase() {
  await run(`
    create table if not exists app_meta (
      ` + "`key`" + ` varchar(120) primary key,
      value json not null,
      updated_at timestamp not null default current_timestamp on update current_timestamp
    )
  `);

  await run(`
    create table if not exists residents (
      id varchar(120) primary key,
      name varchar(255) not null,
      email varchar(255),
      whatsapp varchar(40),
      apartment varchar(20) not null,
      status varchar(40) not null default 'approved',
      payload json not null,
      created_at timestamp not null default current_timestamp,
      updated_at timestamp not null default current_timestamp on update current_timestamp
    )
  `);

  await run(`
    create table if not exists pending_residents (
      id varchar(120) primary key,
      name varchar(255) not null,
      email varchar(255),
      whatsapp varchar(40),
      apartment varchar(20) not null,
      status varchar(40) not null default 'pending',
      payload json not null,
      created_at timestamp not null default current_timestamp,
      updated_at timestamp not null default current_timestamp on update current_timestamp
    )
  `);

  await run(`
    create table if not exists bookings (
      id varchar(120) primary key,
      space_id varchar(120),
      space_name varchar(255),
      date date,
      period varchar(80),
      apartment varchar(20),
      resident_name varchar(255),
      resident_email varchar(255),
      resident_whatsapp varchar(40),
      status varchar(40) not null default 'pending',
      fee decimal(12,2) default 0,
      payload json not null,
      created_at timestamp not null default current_timestamp,
      updated_at timestamp not null default current_timestamp on update current_timestamp
    )
  `);

  await run(`
    create table if not exists visitors (
      id varchar(120) primary key,
      name varchar(255) not null,
      document varchar(120),
      phone varchar(40),
      apartment varchar(20),
      type varchar(80),
      photo longtext,
      payload json not null,
      created_at timestamp not null default current_timestamp,
      updated_at timestamp not null default current_timestamp on update current_timestamp
    )
  `);

  await run(`
    create table if not exists packages (
      id varchar(120) primary key,
      apartment varchar(20),
      recipient varchar(255),
      carrier varchar(255),
      code varchar(255),
      status varchar(40) not null default 'open',
      payload json not null,
      created_at timestamp not null default current_timestamp,
      updated_at timestamp not null default current_timestamp on update current_timestamp
    )
  `);

  await run(`
    create table if not exists notices (
      id varchar(120) primary key,
      title varchar(255) not null,
      category varchar(120),
      message text,
      payload json not null,
      created_at timestamp not null default current_timestamp,
      updated_at timestamp not null default current_timestamp on update current_timestamp
    )
  `);

  await run(`
    create table if not exists staff (
      id varchar(120) primary key,
      name varchar(255) not null,
      role varchar(60) not null,
      email varchar(255),
      whatsapp varchar(40),
      active boolean not null default true,
      payload json not null,
      created_at timestamp not null default current_timestamp,
      updated_at timestamp not null default current_timestamp on update current_timestamp
    )
  `);

  await run(`
    create table if not exists staff_schedules (
      id varchar(120) primary key,
      staff_id varchar(120),
      staff_name varchar(255),
      staff_role varchar(80),
      date date,
      shift varchar(40),
      payload json not null,
      created_at timestamp not null default current_timestamp,
      updated_at timestamp not null default current_timestamp on update current_timestamp
    )
  `);

  await run(`
    create table if not exists services (
      id varchar(120) primary key,
      name varchar(255) not null,
      category varchar(120),
      price decimal(12,2) default 0,
      active boolean not null default true,
      payload json not null,
      created_at timestamp not null default current_timestamp,
      updated_at timestamp not null default current_timestamp on update current_timestamp
    )
  `);

  await run(`
    create table if not exists service_requests (
      id varchar(120) primary key,
      service_id varchar(120),
      service_name varchar(255),
      apartment varchar(20),
      resident_name varchar(255),
      resident_email varchar(255),
      status varchar(40) not null default 'pending',
      amount decimal(12,2) default 0,
      payload json not null,
      created_at timestamp not null default current_timestamp,
      updated_at timestamp not null default current_timestamp on update current_timestamp
    )
  `);

  await run(`
    create table if not exists contact_messages (
      id varchar(120) primary key,
      target varchar(120),
      apartment varchar(20),
      resident_name varchar(255),
      resident_email varchar(255),
      subject varchar(255),
      message text,
      status varchar(40) not null default 'sent',
      payload json not null,
      created_at timestamp not null default current_timestamp,
      updated_at timestamp not null default current_timestamp on update current_timestamp
    )
  `);

  await run(`
    create table if not exists notification_config (
      id int primary key default 1,
      config json not null,
      updated_at timestamp not null default current_timestamp on update current_timestamp
    )
  `);

  await run(`
    create table if not exists asaas_config (
      id int primary key default 1,
      config json not null,
      updated_at timestamp not null default current_timestamp on update current_timestamp
    )
  `);

  await run(`
    create table if not exists notification_logs (
      id varchar(120) primary key,
      channel varchar(80) not null,
      recipient varchar(255),
      subject varchar(255),
      message text,
      status varchar(80) not null,
      error text,
      provider_response json,
      created_at timestamp not null default current_timestamp
    )
  `);

  await run(`
    create table if not exists activity_logs (
      id varchar(120) primary key,
      actor_name varchar(255),
      actor_email varchar(255),
      actor_role varchar(80),
      action varchar(180) not null,
      entity_type varchar(80),
      entity_id varchar(120),
      apartment varchar(20),
      summary varchar(500),
      details json not null,
      created_at timestamp not null default current_timestamp
    )
  `);

  await createIndex('residents', 'idx_residents_apartment', 'apartment');
  await createIndex('pending_residents', 'idx_pending_residents_status', 'status');
  await createIndex('bookings', 'idx_bookings_date_period', 'date, period');
  await createIndex('bookings', 'idx_bookings_status', 'status');
  await createIndex('visitors', 'idx_visitors_apartment_created', 'apartment, created_at');
  await createIndex('packages', 'idx_packages_apartment_status', 'apartment, status');
  await createIndex('staff', 'idx_staff_role_active', 'role, active');
  await createIndex('staff_schedules', 'idx_staff_schedules_date_shift', 'date, shift');
  await createIndex('services', 'idx_services_active', 'active');
  await createIndex('service_requests', 'idx_service_requests_apartment_status', 'apartment, status');
  await createIndex('contact_messages', 'idx_contact_messages_created', 'created_at');
  await createIndex('notification_logs', 'idx_notification_logs_created', 'created_at');
  await createIndex('activity_logs', 'idx_activity_logs_created', 'created_at');
  await createIndex('activity_logs', 'idx_activity_logs_actor', 'actor_email, created_at');
  await createIndex('activity_logs', 'idx_activity_logs_entity', 'entity_type, entity_id');
}

async function createIndex(table, name, columns) {
  try {
    const existing = await query(
      `select count(1) as count from information_schema.statistics where table_schema = database() and table_name = ? and index_name = ?`,
      [table, name]
    );
    const count = Number(rowsOf(existing)[0]?.count || 0);
    if (count === 0) {
      await query(`create index ${name} on ${table} (${columns})`);
    }
  } catch (error) {
    // Em MySQL/Aiven, se duas inicializações ocorrerem próximas, o índice pode já existir.
    // Isso não é erro fatal e não deve derrubar o backend.
    if (error && (error.code === 'ER_DUP_KEYNAME' || String(error.message || '').includes('Duplicate key name'))) return;
    console.warn(`Aviso: não foi possível criar índice ${name}: ${error.message}`);
  }
}

module.exports = { initDatabase };
