-- +goose Up
-- add column "host" to table: "prune_configs"
ALTER TABLE `prune_configs`
    ADD COLUMN `host` text NULL;
-- create index "idx_prune_configs_host" to table: "prune_configs"
CREATE UNIQUE INDEX `idx_prune_configs_host` ON `prune_configs` (`host`);

-- +goose Down
-- reverse: create index "idx_prune_configs_host" to table: "prune_configs"
DROP INDEX `idx_prune_configs_host`;
-- reverse: add column "host" to table: "prune_configs"
ALTER TABLE `prune_configs` DROP COLUMN `host`;
