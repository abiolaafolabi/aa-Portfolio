#!/bin/bash
# Double-click to edit the portfolio. Close this window to stop.
cd "$(dirname "$0")"
(sleep 1; open "http://localhost:4321/portfolio.html?edit") &
python3 edit_server.py
