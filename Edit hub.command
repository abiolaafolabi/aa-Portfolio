#!/bin/bash
# Double-click to edit the hub (index.html). Close this window to stop.
cd "$(dirname "$0")"
(sleep 1; open "http://localhost:4321/index.html?edit") &
python3 edit_server.py
