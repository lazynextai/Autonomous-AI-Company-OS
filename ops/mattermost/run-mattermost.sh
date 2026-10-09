#!/bin/bash
# Runs the mattermost server with env-driven config (supervisord program).
# Mattermost reads MM_* env vars — no config.json editing needed.
set -e
export MM_SQLSETTINGS_DATASOURCE="postgres://postgres:${POSTGRES_LOCAL_PASSWORD:-mm-local-pw}@127.0.0.1:5432/mattermost?sslmode=disable&connect_timeout=10"
export MM_SERVICESETTINGS_SITEURL="${MM_SITE_URL:-https://mattermost.lazynext.com}"
export MM_SERVICESETTINGS_LISTENADDRESS="127.0.0.1:8065"
export MM_SERVICESETTINGS_ENABLELOCALMODE="true"
export MM_SERVICESETTINGS_ENABLEINCOMINGWEBHOOKS="true"
export MM_SERVICESETTINGS_ENABLEOUTGOINGWEBHOOKS="false"
export MM_SERVICESETTINGS_ENABLEPOSTUSERNAMEOVERRIDE="true"
export MM_SERVICESETTINGS_ENABLEPOSTICONOVERRIDE="true"
export MM_FILESETTINGS_DIRECTORY="/data/files"
export MM_LOGSETTINGS_FILELOCATION="/data/logs"
export MM_TEAMSETTINGS_ENABLEOPENSERVER="false"
cd /opt/mattermost-app
exec su-exec postgres /opt/mattermost-app/bin/mattermost
