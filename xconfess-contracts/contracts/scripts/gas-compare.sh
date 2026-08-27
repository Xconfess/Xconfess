#!/bin/bash
set -e

THRESHOLD=${GAS_THRESHOLD:-5}

if [ ! -f gas-baseline.json ]; then
  echo "Missing gas-baseline.json"
  exit 1
fi

node <<EOF
const fs = require("fs");

const baseline = JSON.parse(fs.readFileSync("gas-baseline.json"));
const current = JSON.parse(fs.readFileSync("gas-current.json"));

const threshold = ${THRESHOLD};

let failed = false;

for (const key of Object.keys(baseline)) {
  const oldVal = baseline[key];
  const newVal = current[key];

  const diff = ((newVal - oldVal) / oldVal) * 100;

  console.log(
    \`\${key}: baseline=\${oldVal}, current=\${newVal}, diff=\${diff.toFixed(2)}%\`
  );

  if (diff > threshold) {
    console.error(\`❌ Gas regression in \${key}\`);
    failed = true;
  }
}

if (failed) process.exit(1);
EOF