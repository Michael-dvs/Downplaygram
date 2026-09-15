/**
 * Downplaygram Ghost Viewing Engine
 * Manages declarativeNetRequest dynamic rules to block Instagram story seen beacons.
 */

import { getGhostMode, setGhostMode } from '../storage/settings';

export const GHOST_SEEN_RULE_ID = 1001;

/**
 * The dynamic rule definition to intercept and cancel story seen beacons.
 */
const GHOST_RULE: chrome.declarativeNetRequest.Rule = {
  id: GHOST_SEEN_RULE_ID,
  priority: 1,
  action: {
    type: 'block' as chrome.declarativeNetRequest.RuleActionType,
  },
  condition: {
    urlFilter: '*://*.instagram.com/api/v1/stories/reel/seen/*',
    resourceTypes: [
      'xmlhttprequest' as chrome.declarativeNetRequest.ResourceType,
      'ping' as chrome.declarativeNetRequest.ResourceType,
      'other' as chrome.declarativeNetRequest.ResourceType,
    ],
  },
};

/**
 * Checks if the Ghost Mode dynamic rule is currently active.
 */
export async function getGhostStatus(): Promise<boolean> {
  try {
    if (typeof chrome !== 'undefined' && chrome.declarativeNetRequest) {
      const rules = await chrome.declarativeNetRequest.getDynamicRules();
      return rules.some((rule) => rule.id === GHOST_SEEN_RULE_ID);
    }
  } catch (err) {
    console.error('[Downplaygram] Error getting dynamic rules:', err);
  }
  return getGhostMode();
}

/**
 * Enables Ghost Mode by adding the dynamic rule and persisting state.
 */
export async function enableGhostMode(): Promise<boolean> {
  try {
    if (typeof chrome !== 'undefined' && chrome.declarativeNetRequest) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [GHOST_SEEN_RULE_ID],
        addRules: [GHOST_RULE],
      });
      await setGhostMode(true);
      console.log('[Downplaygram] Ghost Mode ENABLED: Seen beacon blocked (Rule 1001).');
      return true;
    }
  } catch (err) {
    console.error('[Downplaygram] Failed to enable Ghost Mode rule:', err);
  }
  return false;
}

/**
 * Disables Ghost Mode by removing the dynamic rule and updating state.
 */
export async function disableGhostMode(): Promise<boolean> {
  try {
    if (typeof chrome !== 'undefined' && chrome.declarativeNetRequest) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [GHOST_SEEN_RULE_ID],
      });
      await setGhostMode(false);
      console.log('[Downplaygram] Ghost Mode DISABLED: Normal story viewing restored.');
      return true;
    }
  } catch (err) {
    console.error('[Downplaygram] Failed to disable Ghost Mode rule:', err);
  }
  return false;
}

/**
 * Initializes the ghost engine during service worker startup.
 * Synchronizes declarativeNetRequest rules with persisted user settings.
 */
export async function initGhostEngine(): Promise<void> {
  const isEnabled = await getGhostMode();
  if (isEnabled) {
    await enableGhostMode();
  } else {
    await disableGhostMode();
  }
}
