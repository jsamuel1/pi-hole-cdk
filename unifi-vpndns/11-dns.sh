#!/bin/sh

if ! grep -qxF "interface=vti64" /run/dnsmasq.conf.d/custom.conf; then
  echo interface=vti64 >> /var/run/dnsmasq.conf.d/custom.conf
  kill -9 "$(cat /run/dnsmasq.pid)"
fi