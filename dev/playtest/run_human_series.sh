#!/bin/sh
# Sequential keyboard-path human playtest series (one browser at a time: the agent is latency sensitive).
cd "$(dirname "$0")" && mkdir -p results
for cfg in "3 doubles sideout 31" "3 doubles sideout 32" "4 doubles sideout 33" "4 doubles sideout 34" "5 doubles sideout 35" "6 doubles sideout 36" "3 singles rally 37" "4 singles rally 38"; do
  set -- $cfg
  node human.mjs --opp $1 --mode $2 --scoring $3 --seed $4 --secs 270 --out results/series_$1_$2_$3_$4.json > results/series_$1_$2_$3_$4.txt 2>&1
done
echo done > results/series_done.txt
