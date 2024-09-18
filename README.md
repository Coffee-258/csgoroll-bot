# Discontinued project. You can't just download and run it in its current state. Take the code you need and put it into your own bot :) gl guys take care to not get banned

# I know its messy as fuck but I don't care anymore


﻿# CSGORoll Trade Bot 2.0

A program to manage CSGORoll trading automatically

## Setup

A few configuration files are needed so the bot runs properly:

### /roll-bot-v2/cfg/blacklist.json

##### Example:

    [
        "Chainmail",
        "Minotaur",
        "Dark Age",
        ...
    ]

### /roll-bot-v2/cfg/config.json

##### Example:

    {
        "auto_confirm": false,
        "auto_accept_trade_offer": true,
        "auto_cancel_trade_offer_delay": 300,
        "two_captcha_api_key": "",
        "recaptcha_site_key": "",
        "recaptcha_site_url": "https://www.csgoroll.gg/en/withdraw/csgo/p2p",
        "recaptcha_proxy": "http://68.183.209.54/",
        "recaptcha_proxytype": "HTTP",
        "steam_id": "",
        "use_withdraw_rate_limit": true,
        "withdraw_rate_limit_delay": 30000,
        "discord_bot_token": "",
        "discord_user_id": ""
    }

### /roll-bot-v2/cfg/secrets.json

##### Example:

    {
        "username": "username",
        "password": "password",
        "shared_secret": "shared_secret",
        "identity_secret": "identity_secret",
    }

### /roll-bot-v2/filter.json

##### Example:

    {
        "general": [
            {
                "min": "10",
                "max": "500",
                "percent": "0",
                "blacklist": true,
                "stat": false,
                "souvenir": false,
                "fn": true,
                "mw": true,
                "ft": true,
                "ww": true,
                "bs": true
            }
        ],
        "stickers": [
            {
                "name": "Katowice 2014",
                "min": "0",
                "max": "30",
                "percent": "99999",
                "blacklist": false,
                "stat": true,
                "souvenir": false,
                "fn": true,
                "mw": true,
                "ft": true,
                "ww": true,
                "bs": true
            }
            ...
        ],
        "specific": [...],
        "generalsUseCustomFloat": true,
        "stickerUseCustomFloat": false,
        "specificUseCustomFloat": false,
        "fnMin": "0",
        "fnMax": "0.07",
        "mwMin": "0.07",
        "mwMax": "0.15",
        "ftMin": "0.15",
        "ftMax": "0.38",
        "wwMin": "0.38",
        "wwMax": "0.45",
        "bsMin": "0.45",
        "bsMax": "1"
    }
