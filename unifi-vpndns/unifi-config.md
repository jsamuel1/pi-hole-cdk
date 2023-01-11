steps:

* Setup 2x Site-to-Site VPN as IPSEC using AWS VPN config
* Set up a persistent boot change, using https://github.com/unifi-utilities/unifi-utilities/ on-boot script
(See https://github.com/unifi-utilities/unifios-utilities/tree/main/on-boot-script for install details)
* Use `11-dns.sh` in this folder as an on-boot script to add an interface to unifi's dnsmasq to allow PiHole to conditionally forward requests back
* Configure the PiHole to conditionally forward to your unifi for your home network.
* Test using `dig @<unifiIP address> -x <unifiIP address>`  -- eg.  `dig @192.168.1.1 -x 192.168.1.1`  -- should return quickly with a reverse lookup for your unifi device.
