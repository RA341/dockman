-- +goose Up
-- create "users" table
CREATE TABLE IF NOT EXISTS `users`
(
    `id`                 integer  NULL PRIMARY KEY AUTOINCREMENT,
    `created_at`         datetime NULL,
    `updated_at`         datetime NULL,
    `deleted_at`         datetime NULL,
    `username`           text     NOT NULL,
    `encrypted_password` text     NOT NULL
);
-- create index "idx_users_username" to table: "users"
CREATE UNIQUE INDEX IF NOT EXISTS `idx_users_username` ON `users` (`username`);
-- create index "idx_users_deleted_at" to table: "users"
CREATE INDEX IF NOT EXISTS `idx_users_deleted_at` ON `users` (`deleted_at`);
-- create "sessions" table
CREATE TABLE IF NOT EXISTS `sessions`
(
    `id`           integer  NULL PRIMARY KEY AUTOINCREMENT,
    `created_at`   datetime NULL,
    `updated_at`   datetime NULL,
    `deleted_at`   datetime NULL,
    `user_id`      integer  NULL,
    `hashed_token` text     NULL,
    `expires`      datetime NULL,
    CONSTRAINT `fk_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION
);
-- create index "idx_sessions_hashed_token" to table: "sessions"
CREATE INDEX IF NOT EXISTS `idx_sessions_hashed_token` ON `sessions` (`hashed_token`);
-- create index "idx_sessions_deleted_at" to table: "sessions"
CREATE INDEX IF NOT EXISTS `idx_sessions_deleted_at` ON `sessions` (`deleted_at`);
-- create "folder_aliases_2" table
CREATE TABLE IF NOT EXISTS `folder_aliases_2`
(
    `id`         integer  NULL PRIMARY KEY AUTOINCREMENT,
    `created_at` datetime NULL,
    `updated_at` datetime NULL,
    `deleted_at` datetime NULL,
    `config_id`  integer  NULL,
    `alias`      text     NULL,
    `fullpath`   text     NULL,
    CONSTRAINT `fk_host_config_folder_aliases` FOREIGN KEY (`config_id`) REFERENCES `host_config` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION
);
-- create index "idx_config_path" to table: "folder_aliases_2"
CREATE UNIQUE INDEX IF NOT EXISTS `idx_config_path` ON `folder_aliases_2` (`config_id`, `fullpath`);
-- create index "idx_config_alias" to table: "folder_aliases_2"
CREATE UNIQUE INDEX IF NOT EXISTS `idx_config_alias` ON `folder_aliases_2` (`config_id`, `alias`);
-- create index "idx_folder_aliases_2_deleted_at" to table: "folder_aliases_2"
CREATE INDEX IF NOT EXISTS `idx_folder_aliases_2_deleted_at` ON `folder_aliases_2` (`deleted_at`);
-- create "version_history" table
CREATE TABLE IF NOT EXISTS `version_history`
(
    `id`         integer  NULL PRIMARY KEY AUTOINCREMENT,
    `created_at` datetime NULL,
    `updated_at` datetime NULL,
    `deleted_at` datetime NULL,
    `version`    text     NOT NULL,
    `read`       numeric  NOT NULL DEFAULT false
);
-- create index "version_history_version" to table: "version_history"
CREATE UNIQUE INDEX IF NOT EXISTS `version_history_version` ON `version_history` (`version`);
-- create index "idx_version_history_deleted_at" to table: "version_history"
CREATE INDEX IF NOT EXISTS `idx_version_history_deleted_at` ON `version_history` (`deleted_at`);
-- create "user_configs" table
CREATE TABLE IF NOT EXISTS `user_configs`
(
    `id`          integer  NULL PRIMARY KEY AUTOINCREMENT,
    `created_at`  datetime NULL,
    `updated_at`  datetime NULL,
    `deleted_at`  datetime NULL,
    `enable`      numeric  NOT NULL DEFAULT false,
    `notify_only` numeric  NOT NULL DEFAULT false,
    `interval`    integer  NOT NULL DEFAULT 43200000000000
);
-- create index "idx_user_configs_deleted_at" to table: "user_configs"
CREATE INDEX IF NOT EXISTS `idx_user_configs_deleted_at` ON `user_configs` (`deleted_at`);
-- create "prune_configs" table
CREATE TABLE IF NOT EXISTS `prune_configs`
(
    `id`          integer  NULL PRIMARY KEY AUTOINCREMENT,
    `created_at`  datetime NULL,
    `updated_at`  datetime NULL,
    `deleted_at`  datetime NULL,
    `enabled`     numeric  NULL,
    `interval`    integer  NULL,
    `volumes`     numeric  NULL,
    `networks`    numeric  NULL,
    `images`      numeric  NULL,
    `containers`  numeric  NULL,
    `build_cache` numeric  NULL
);
-- create index "idx_prune_configs_deleted_at" to table: "prune_configs"
CREATE INDEX IF NOT EXISTS `idx_prune_configs_deleted_at` ON `prune_configs` (`deleted_at`);
-- create "prune_results" table
CREATE TABLE IF NOT EXISTS `prune_results`
(
    `id`                  integer  NULL PRIMARY KEY AUTOINCREMENT,
    `created_at`          datetime NULL,
    `updated_at`          datetime NULL,
    `deleted_at`          datetime NULL,
    `host`                text     NULL,
    `err`                 text     NULL,
    `volumes_success`     text     NULL,
    `volumes_err`         text     NULL,
    `networks_success`    text     NULL,
    `networks_err`        text     NULL,
    `images_success`      text     NULL,
    `images_err`          text     NULL,
    `containers_success`  text     NULL,
    `containers_err`      text     NULL,
    `build_cache_success` text     NULL,
    `build_cache_err`     text     NULL
);
-- create index "idx_prune_results_deleted_at" to table: "prune_results"
CREATE INDEX IF NOT EXISTS `idx_prune_results_deleted_at` ON `prune_results` (`deleted_at`);
-- create "ssh_configs" table
CREATE TABLE IF NOT EXISTS `ssh_configs`
(
    `id`          integer  NULL PRIMARY KEY AUTOINCREMENT,
    `created_at`  datetime NULL,
    `updated_at`  datetime NULL,
    `deleted_at`  datetime NULL,
    `name`        text     NOT NULL,
    `public_key`  blob     NULL,
    `private_key` blob     NULL
);
-- create index "ssh_configs_name" to table: "ssh_configs"
CREATE UNIQUE INDEX IF NOT EXISTS `ssh_configs_name` ON `ssh_configs` (`name`);
-- create index "idx_ssh_configs_deleted_at" to table: "ssh_configs"
CREATE INDEX IF NOT EXISTS `idx_ssh_configs_deleted_at` ON `ssh_configs` (`deleted_at`);
-- create "ssh_host_info" table
CREATE TABLE IF NOT EXISTS `ssh_host_info`
(
    `id`                  integer  NULL PRIMARY KEY AUTOINCREMENT,
    `created_at`          datetime NULL,
    `updated_at`          datetime NULL,
    `deleted_at`          datetime NULL,
    `host`                text     NOT NULL,
    `port`                integer  NOT NULL DEFAULT 22,
    `user`                text     NOT NULL,
    `password`            text     NULL,
    `remote_public_key`   text     NULL,
    `use_public_key_auth` numeric  NOT NULL DEFAULT false
);
-- create index "idx_ssh_host_info_deleted_at" to table: "ssh_host_info"
CREATE INDEX IF NOT EXISTS `idx_ssh_host_info_deleted_at` ON `ssh_host_info` (`deleted_at`);
-- create "host_config" table
CREATE TABLE IF NOT EXISTS `host_config`
(
    `id`            integer  NULL PRIMARY KEY AUTOINCREMENT,
    `created_at`    datetime NULL,
    `updated_at`    datetime NULL,
    `deleted_at`    datetime NULL,
    `name`          text     NULL,
    `type`          text     NULL,
    `enable`        numeric  NOT NULL DEFAULT false,
    `docker_socket` text     NULL,
    `ssh_id`        integer  NULL     DEFAULT (null),
    `machine_addr`  text     NULL,
    CONSTRAINT `fk_host_config_ssh_options` FOREIGN KEY (`ssh_id`) REFERENCES `ssh_host_info` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION
);
-- create index "idx_host_config_deleted_at" to table: "host_config"
CREATE INDEX IF NOT EXISTS `idx_host_config_deleted_at` ON `host_config` (`deleted_at`);

-- +goose Down
-- reverse: create index "idx_host_config_deleted_at" to table: "host_config"
DROP INDEX `idx_host_config_deleted_at`;
-- reverse: create "host_config" table
DROP TABLE `host_config`;
-- reverse: create index "idx_ssh_host_info_deleted_at" to table: "ssh_host_info"
DROP INDEX `idx_ssh_host_info_deleted_at`;
-- reverse: create "ssh_host_info" table
DROP TABLE `ssh_host_info`;
-- reverse: create index "idx_ssh_configs_deleted_at" to table: "ssh_configs"
DROP INDEX `idx_ssh_configs_deleted_at`;
-- reverse: create index "ssh_configs_name" to table: "ssh_configs"
DROP INDEX `ssh_configs_name`;
-- reverse: create "ssh_configs" table
DROP TABLE `ssh_configs`;
-- reverse: create index "idx_prune_results_deleted_at" to table: "prune_results"
DROP INDEX `idx_prune_results_deleted_at`;
-- reverse: create "prune_results" table
DROP TABLE `prune_results`;
-- reverse: create index "idx_prune_configs_deleted_at" to table: "prune_configs"
DROP INDEX `idx_prune_configs_deleted_at`;
-- reverse: create "prune_configs" table
DROP TABLE `prune_configs`;
-- reverse: create index "idx_user_configs_deleted_at" to table: "user_configs"
DROP INDEX `idx_user_configs_deleted_at`;
-- reverse: create "user_configs" table
DROP TABLE `user_configs`;
-- reverse: create index "idx_version_history_deleted_at" to table: "version_history"
DROP INDEX `idx_version_history_deleted_at`;
-- reverse: create index "version_history_version" to table: "version_history"
DROP INDEX `version_history_version`;
-- reverse: create "version_history" table
DROP TABLE `version_history`;
-- reverse: create index "idx_folder_aliases_2_deleted_at" to table: "folder_aliases_2"
DROP INDEX `idx_folder_aliases_2_deleted_at`;
-- reverse: create index "idx_config_alias" to table: "folder_aliases_2"
DROP INDEX `idx_config_alias`;
-- reverse: create index "idx_config_path" to table: "folder_aliases_2"
DROP INDEX `idx_config_path`;
-- reverse: create "folder_aliases_2" table
DROP TABLE `folder_aliases_2`;
-- reverse: create index "idx_sessions_deleted_at" to table: "sessions"
DROP INDEX `idx_sessions_deleted_at`;
-- reverse: create index "idx_sessions_hashed_token" to table: "sessions"
DROP INDEX `idx_sessions_hashed_token`;
-- reverse: create "sessions" table
DROP TABLE `sessions`;
-- reverse: create index "idx_users_deleted_at" to table: "users"
DROP INDEX `idx_users_deleted_at`;
-- reverse: create index "idx_users_username" to table: "users"
DROP INDEX `idx_users_username`;
-- reverse: create "users" table
DROP TABLE `users`;
