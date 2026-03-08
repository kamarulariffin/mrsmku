PROJECT_ROOT ?= $(abspath .)
SUDO ?= sudo
DB_ENGINE ?= postgres

BACKEND_DIR := $(PROJECT_ROOT)/backend
CHECK_PORTS_SCRIPT := $(PROJECT_ROOT)/check-ports.sh
START_CLEAN_SCRIPT := $(PROJECT_ROOT)/start-clean.sh

SYSTEMD_SCRIPTS_DIR := $(PROJECT_ROOT)/backend/deploy/systemd
PROM_INSTALLER := $(SYSTEMD_SCRIPTS_DIR)/install_mrsm_prometheus_token_timer.sh
PROM_UNINSTALLER := $(SYSTEMD_SCRIPTS_DIR)/uninstall_mrsm_prometheus_token_timer.sh
PROM_CHECKER := $(SYSTEMD_SCRIPTS_DIR)/check_mrsm_prometheus_token_timer.sh
PROM_STATUS := $(SYSTEMD_SCRIPTS_DIR)/status_mrsm_prometheus_token_timer.sh
PROM_DOCTOR := $(SYSTEMD_SCRIPTS_DIR)/doctor_mrsm_prometheus_token_timer.sh
PROM_REPORTER := $(SYSTEMD_SCRIPTS_DIR)/report_mrsm_prometheus_token_timer.sh
PROM_REPORT_OPEN := $(SYSTEMD_SCRIPTS_DIR)/open_latest_mrsm_prometheus_report.sh

PYTHON_BACKEND ?= $(BACKEND_DIR)/venv/bin/python
PG_CUTOVER := $(BACKEND_DIR)/scripts/cutover_core_to_postgres.sh
PG_RECONCILE := $(BACKEND_DIR)/scripts/reconcile_core_divergence.py
PG_PARITY := $(BACKEND_DIR)/scripts/verify_core_parity.py
PG_RECONCILE_SOURCE ?= postgres
PG_RECONCILE_COLLECTIONS ?= notifications audit_logs student_yuran yuran_payments accounting_categories accounting_transactions accounting_audit_logs accounting_journal_entries accounting_journal_lines tabung_campaigns tabung_donations financial_ledger

.PHONY: help app-help prom-help pg-help \
	app-check-ports app-check-ports-backend app-start-clean app-start-clean-dry-run app-start-clean-backend \
	pg-cutover pg-cutover-reconcile pg-cutover-prune pg-parity pg-reconcile-dry-run pg-reconcile pg-reconcile-prune \
	prom-install prom-install-dry-run \
	prom-check prom-check-scrape prom-status prom-status-no-scrape \
	prom-all prom-all-no-scrape prom-report prom-report-no-scrape prom-report-open-latest \
	prom-doctor prom-doctor-fix \
	prom-uninstall prom-uninstall-remove-secrets

help: app-help prom-help pg-help

app-help:
	@echo "MRSM app runtime shortcuts:"
	@echo "  make app-check-ports          # semak semua port + endpoint (frontend+backend+DB)"
	@echo "  make app-check-ports-backend  # semak backend+DB sahaja"
	@echo "  make app-start-clean          # clean konflik port + start backend(single) + frontend"
	@echo "  make app-start-clean-dry-run  # simulasi tindakan tanpa ubah sistem"
	@echo "  make app-start-clean-backend  # clean konflik + start backend(single) sahaja"
	@echo ""
	@echo "Optional overrides:"
	@echo "  DB_ENGINE=postgres|hybrid|mongo"

prom-help:
	@echo "MRSM Prometheus Token Refresh shortcuts:"
	@echo "  make prom-install PROM_EMAIL=... PROM_PASSWORD=...      # install systemd timer (sudo)"
	@echo "  make prom-install-dry-run                               # simulate install"
	@echo "  make prom-check                                         # check units + token"
	@echo "  make prom-check-scrape                                  # check + scrape endpoint"
	@echo "  make prom-status                                        # quick status + scrape test"
	@echo "  make prom-status-no-scrape                              # quick status without scrape"
	@echo "  make prom-all                                           # full audit (check + status + doctor)"
	@echo "  make prom-all-no-scrape                                 # full audit without scrape checks"
	@echo "  make prom-report                                        # generate timestamped audit report"
	@echo "  make prom-report-no-scrape                              # generate report without scrape tests"
	@echo "  make prom-report-open-latest                            # show latest report summary"
	@echo "  make prom-doctor                                        # diagnose setup"
	@echo "  make prom-doctor-fix PROM_EMAIL=... PROM_PASSWORD=...  # diagnose + auto-fix (sudo)"
	@echo "  make prom-uninstall                                     # remove units (keep secrets)"
	@echo "  make prom-uninstall-remove-secrets                      # remove units + secrets"
	@echo ""
	@echo "Optional overrides:"
	@echo "  PROJECT_ROOT=/opt/yuranmrsmV2  SUDO=sudo"
	@echo "  REPORT_DIR=/path/to/reports"

pg-help:
	@echo "MRSM PostgreSQL cutover shortcuts:"
	@echo "  make pg-cutover                    # ETL + parity"
	@echo "  make pg-cutover-reconcile          # ETL + reconcile runtime + parity"
	@echo "  make pg-cutover-prune              # ETL + reconcile runtime prune + parity"
	@echo "  make pg-parity                     # parity check sahaja"
	@echo "  make pg-reconcile-dry-run          # reconcile dry-run (default source=postgres)"
	@echo "  make pg-reconcile                  # reconcile execute"
	@echo "  make pg-reconcile-prune            # reconcile execute + prune target"
	@echo ""
	@echo "Optional overrides:"
	@echo "  PG_RECONCILE_SOURCE=postgres|mongo"
	@echo "  PG_RECONCILE_COLLECTIONS='notifications audit_logs ...'"

app-check-ports:
	"$(CHECK_PORTS_SCRIPT)"

app-check-ports-backend:
	"$(CHECK_PORTS_SCRIPT)" --backend-only

app-start-clean:
	DB_ENGINE="$(DB_ENGINE)" "$(START_CLEAN_SCRIPT)"

app-start-clean-dry-run:
	DB_ENGINE="$(DB_ENGINE)" "$(START_CLEAN_SCRIPT)" --dry-run

app-start-clean-backend:
	DB_ENGINE="$(DB_ENGINE)" "$(START_CLEAN_SCRIPT)" --backend-only

pg-cutover:
	cd "$(BACKEND_DIR)" && ./scripts/cutover_core_to_postgres.sh

pg-cutover-reconcile:
	cd "$(BACKEND_DIR)" && ./scripts/cutover_core_to_postgres.sh --reconcile-runtime

pg-cutover-prune:
	cd "$(BACKEND_DIR)" && ./scripts/cutover_core_to_postgres.sh --reconcile-runtime-prune

pg-parity:
	cd "$(BACKEND_DIR)" && DB_ENGINE=postgres "$(PYTHON_BACKEND)" "$(PG_PARITY)"

pg-reconcile-dry-run:
	cd "$(BACKEND_DIR)" && "$(PYTHON_BACKEND)" "$(PG_RECONCILE)" --source "$(PG_RECONCILE_SOURCE)" --collections $(PG_RECONCILE_COLLECTIONS)

pg-reconcile:
	cd "$(BACKEND_DIR)" && "$(PYTHON_BACKEND)" "$(PG_RECONCILE)" --source "$(PG_RECONCILE_SOURCE)" --collections $(PG_RECONCILE_COLLECTIONS) --execute

pg-reconcile-prune:
	cd "$(BACKEND_DIR)" && "$(PYTHON_BACKEND)" "$(PG_RECONCILE)" --source "$(PG_RECONCILE_SOURCE)" --collections $(PG_RECONCILE_COLLECTIONS) --execute --prune-target

prom-install:
	@if [ -z "$(PROM_EMAIL)" ] || [ -z "$(PROM_PASSWORD)" ]; then \
		echo "ERROR: PROM_EMAIL and PROM_PASSWORD are required."; \
		echo "Usage: make prom-install PROM_EMAIL=... PROM_PASSWORD=..."; \
		exit 1; \
	fi
	$(SUDO) "$(PROM_INSTALLER)" \
		--project-root "$(PROJECT_ROOT)" \
		--prom-email "$(PROM_EMAIL)" \
		--prom-password "$(PROM_PASSWORD)"

prom-install-dry-run:
	"$(PROM_INSTALLER)" --project-root "$(PROJECT_ROOT)" --dry-run

prom-check:
	"$(PROM_CHECKER)"

prom-check-scrape:
	"$(PROM_CHECKER)" --scrape-test

prom-status:
	"$(PROM_STATUS)" --scrape-test

prom-status-no-scrape:
	"$(PROM_STATUS)" --no-scrape-test

prom-all: prom-check-scrape prom-status prom-doctor
	@echo "prom-all completed."

prom-all-no-scrape: prom-check prom-status-no-scrape
	"$(PROM_DOCTOR)"
	@echo "prom-all-no-scrape completed."

prom-report:
	"$(PROM_REPORTER)" --scrape-test $(if $(REPORT_DIR),--output-dir "$(REPORT_DIR)")

prom-report-no-scrape:
	"$(PROM_REPORTER)" --no-scrape-test $(if $(REPORT_DIR),--output-dir "$(REPORT_DIR)")

prom-report-open-latest:
	"$(PROM_REPORT_OPEN)" $(if $(REPORT_DIR),--report-dir "$(REPORT_DIR)")

prom-doctor:
	"$(PROM_DOCTOR)" --scrape-test

prom-doctor-fix:
	@if [ -z "$(PROM_EMAIL)" ] || [ -z "$(PROM_PASSWORD)" ]; then \
		echo "ERROR: PROM_EMAIL and PROM_PASSWORD are required."; \
		echo "Usage: make prom-doctor-fix PROM_EMAIL=... PROM_PASSWORD=..."; \
		exit 1; \
	fi
	$(SUDO) "$(PROM_DOCTOR)" \
		--project-root "$(PROJECT_ROOT)" \
		--auto-fix \
		--scrape-test \
		--prom-email "$(PROM_EMAIL)" \
		--prom-password "$(PROM_PASSWORD)"

prom-uninstall:
	$(SUDO) "$(PROM_UNINSTALLER)"

prom-uninstall-remove-secrets:
	$(SUDO) "$(PROM_UNINSTALLER)" --remove-secrets
