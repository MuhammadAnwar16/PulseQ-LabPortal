"""PulseQ integration module.

Loaded conditionally when INTEGRATION_MODE=pulseq_connected.
Provides REST endpoints for PulseQ to send lab orders and fetch results,
plus outbound WebSocket events via Redis Pub/Sub so PulseQ frontends
receive live lab-result notifications.
"""
