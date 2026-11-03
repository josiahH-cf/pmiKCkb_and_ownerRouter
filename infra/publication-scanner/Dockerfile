# Official non-base LTS image: includes a database snapshot, still refreshed and
# verified at startup. This exact digest is linux/amd64; do not use a floating tag.
FROM clamav/clamav:1.4.6-debian13-slim@sha256:4cbcd1fea2e6dfa9ceca73e4f1555cdda39860ed45483d361535a8f1d50f72ae
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app /tmp/pmi-clamav \
    && chown clamav:clamav /tmp/pmi-clamav /var/lib/clamav \
    && chmod 700 /tmp/pmi-clamav
COPY clamd.conf /etc/clamav/pmi-clamd.conf
COPY freshclam.conf /etc/clamav/pmi-freshclam.conf
COPY scanner_service.py start-scanner.sh /app/
RUN chmod 555 /app/start-scanner.sh /app/scanner_service.py \
    && chmod 444 /etc/clamav/pmi-clamd.conf /etc/clamav/pmi-freshclam.conf
ENV TZ=Etc/UTC LC_ALL=C PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8080
USER clamav
EXPOSE 8080
ENTRYPOINT ["/app/start-scanner.sh"]
CMD []
