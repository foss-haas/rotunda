#!/bin/bash
if command -v flow > /dev/null; then
  flow
else
  echo 'Flow not found.'
fi
