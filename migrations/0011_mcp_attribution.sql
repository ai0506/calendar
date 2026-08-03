-- AI0506 Calendar — Migration 0011: track which MCP client last touched a record
--
-- last_modified_by stores the OAuth client_name (e.g. "Claude", "ChatGPT") of the
-- MCP connector that last wrote to the row. NULL means the row has never been
-- written through MCP (created/edited via the web UI only, or predates this column).
-- Web UI (cookie auth) writes never set this column.

ALTER TABLE events ADD COLUMN last_modified_by TEXT;
ALTER TABLE deadlines ADD COLUMN last_modified_by TEXT;
ALTER TABLE event_series ADD COLUMN last_modified_by TEXT;
