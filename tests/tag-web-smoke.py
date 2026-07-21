import os
from pathlib import Path

from playwright.sync_api import sync_playwright


def password_from_dev_vars():
    for line in Path('.dev.vars').read_text(encoding='utf-8').splitlines():
        if line.startswith('PASSWORD='):
            return line.split('=', 1)[1].strip().strip('"')
    raise RuntimeError('PASSWORD is missing from .dev.vars')


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    console_errors = []
    page.on('console', lambda message: console_errors.append(message.text) if message.type == 'error' else None)
    page.goto(os.environ.get('TEST_BASE_URL', 'http://localhost:8789'), wait_until='networkidle')
    page.locator('#passwordInput').fill(password_from_dev_vars())
    page.locator('#loginForm button[type=submit]').click()
    page.wait_for_selector('body.is-authenticated')
    page.locator('[data-action=open-event]').click()
    page.wait_for_selector('#fTagPicker .tag-chip')
    assert page.locator('#fTagPicker .tag-chip').count() == 6
    assert page.locator('#fTagSearch').count() == 0
    widths = page.locator('#fTagPicker .tag-chip').evaluate_all('(chips) => chips.map((chip) => Math.round(chip.getBoundingClientRect().width))')
    assert len(set(widths)) == 1, widths
    page.locator('#fTagPicker [data-tag-picker-toggle]').click()
    assert page.locator('#fTagPicker .tag-chip').count() >= 10
    page.locator('#fTagPicker [data-tag-id=tag-exam]').click()
    assert 'selected' in (page.locator('#fTagPicker [data-tag-id=tag-exam]').get_attribute('class') or '')
    page.locator('#fTitle').fill('Tag web smoke event')
    page.locator('#fDate').fill('2026-07-21')
    page.locator('#eventForm button[type=submit]').click()
    page.wait_for_selector('#eventScrim:not(.open)')
    assert not console_errors, console_errors
    browser.close()
