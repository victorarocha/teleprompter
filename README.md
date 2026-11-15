# Teleprompter

A controller and a display that share one script. Run it on a computer you control. Open the controller on a phone and the display on a laptop or TV.

## Setup

```bash
pnpm install
cp .env.example .env.local
```

Set `TELEPROMPTER_PASSWORD` in `.env.local`. The controller asks for that password. The display does not. Anyone who can open the server can read the script on the display.

```bash
pnpm dev
```

The server listens on every network interface. On this computer open [http://localhost:3000](http://localhost:3000). On a phone or tablet, open `http://<this-computer-ip>:3000`. Private LAN addresses are allowed while `pnpm dev` is running.

`pnpm build` then `pnpm start` runs the same server without hot reload.

The last script, text size, speed, mirror setting, and scroll position are stored in `data/show.json`.

## Screens

- **Controller** (`/controller`): script, speed in pixels per second (default 40), text size in pixels (default 42), mirror, play, pause, reset, rewind, forward, and a position bar. Play counts down from 3 when the script is at the top, then scrolls. Playing again after a pause continues at once. Rewind and forward jump about three lines. The position bar scrubs to any point in the script. The live view matches the display, including mirror.
- **Display** (`/display`): the script, a reading line, and the countdown. No buttons.

## Install

Each screen has its own manifest. From the browser menu, install the controller on the phone and the display on the other device.

Install needs HTTPS, or `localhost`. A phone opening `http://192.168.x.x` can use the app in the browser, and can install it once the server is served over HTTPS.
