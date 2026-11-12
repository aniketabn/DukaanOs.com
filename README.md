# DukaanOS

Shop point-of-sale prototype for kirana, restaurant and salon merchants. One HTML page, with bundled catalogue data.

## Features
- Register with quick billing, search-add of catalogue items, and an optional stock count
- Order channels: WhatsApp Business, website, and Swiggy/Zomato (restaurants only)
- Payments: cash, UPI, card, cash on delivery, payment links, and reconciliation
- Khata (udhaar) by voice or text, with customer visits tracked by UPI ID
- Campaigns and social posts (simulated in this prototype)
- Multiple stores and staff sign-in with PIN

## Run locally
Open `index.html` in a browser. No install or server is needed.

## Publish on GitHub Pages
1. Push this folder to the repository's `main` branch.
2. In Settings → Pages, choose "Deploy from a branch", branch `main`, folder `/ (root)`.
3. The site is served at the Pages URL. The `data/` folder must stay next to `index.html`.

## Notes
- Payments, WhatsApp delivery and partner delivery status are simulated. Real use needs the provider APIs.
