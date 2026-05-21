create table if not exists browser_notifications (
  id varchar(100) primary key,
  title varchar(180) not null,
  body text not null,
  type varchar(50) default 'geral',
  priority varchar(30) default 'normal',
  audience varchar(40) default 'all',
  target_unit varchar(80),
  target_role varchar(80),
  target_user_id varchar(160),
  url text,
  payload jsonb,
  created_by varchar(160),
  created_at timestamp default current_timestamp
);

create table if not exists browser_notification_reads (
  notification_id varchar(100) not null,
  user_id varchar(160) not null,
  read_at timestamp default current_timestamp,
  primary key (notification_id, user_id)
);

create index if not exists idx_browser_notifications_audience on browser_notifications (audience);
create index if not exists idx_browser_notifications_target_unit on browser_notifications (target_unit);
create index if not exists idx_browser_notifications_target_role on browser_notifications (target_role);
create index if not exists idx_browser_notifications_created_at on browser_notifications (created_at desc);
