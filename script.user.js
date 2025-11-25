// ==UserScript==
// @name         CCO Pattern List
// @namespace    http://tampermonkey.net/
// @version      0.6
// @description  Display special skin patterns with overpay information
// @author       wkRaphael
// @match        https://case-clicker.com/*
// @updateURL    https://raw.githubusercontent.com/wkRaphael/CCO-Pattern-Script/refs/heads/main/script.user.js
// @downloadURL  https://raw.githubusercontent.com/wkRaphael/CCO-Pattern-Script/refs/heads/main/script.user.js
// @grant        none
// ==/UserScript==
(function() {
    'use strict';

    let patternScriptConfig = {
        "textColor": "#5cffd7"
    }

    // Global variable to store patterns data
    let specialPatternsData = null;
    let currentURL = window.location.href;

    // Function to check if we're on a cases page
    function isOnCasesPage() {
        return window.location.pathname.startsWith('/cases/');
    }

    // Function to fetch patterns from Case Clicker directly
    async function fetchPatternsData() {
        try {
            console.log('Fetching patterns data...');

            // Get Build ID from Next.js data
            let buildId;
            try {
                const nextData = document.getElementById('__NEXT_DATA__');
                if (nextData) {
                    const jsonData = JSON.parse(nextData.textContent);
                    buildId = jsonData.buildId;
                    console.log('Found Build ID:', buildId);
                } else {
                    throw new Error('__NEXT_DATA__ element not found');
                }
            } catch (e) {
                console.error('Error getting Build ID:', e);
                return false;
            }

            // Construct URL with dynamic Build ID
            const patternsUrl = `https://case-clicker.com/_next/data/${buildId}/en/help/patterns.json`;
            console.log('Fetching from:', patternsUrl);

            const response = await fetch(patternsUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            let rawSkins = null;

            // Handle Next.js data structure
            // 1. Check for pageProps
            if (data.pageProps) {
                // 2. Check for 'skingroups' (New API Format)
                if (data.pageProps.skingroups) {
                    // The new API sends this as a stringified JSON string, not an object
                    if (typeof data.pageProps.skingroups === 'string') {
                        try {
                            rawSkins = JSON.parse(data.pageProps.skingroups);
                            console.log('Successfully parsed stringified skingroups');
                        } catch (e) {
                            console.error('Failed to parse skingroups string:', e);
                        }
                    } else {
                        // In case it reverts to being a normal array
                        rawSkins = data.pageProps.skingroups;
                    }
                }
                // 3. Fallback check for old 'skins' format
                else if (data.pageProps.skins) {
                    rawSkins = data.pageProps.skins;
                }
            }
            // 4. Direct check (rare, but good fallback)
            else if (data.skins) {
                rawSkins = data.skins;
            }

            if (rawSkins && Array.isArray(rawSkins)) {
                // Normalize data structure
                specialPatternsData = {
                    skins: rawSkins.map(skin => ({
                        ...skin,
                        // Ensure skinName exists by using 'name' if 'skinName' is missing
                        skinName: skin.skinName || skin.name,
                        // Normalize patterns array to ensure patternName exists
                        patterns: skin.patterns ? skin.patterns.map(p => ({
                            ...p,
                            // The new API uses 'name' for the pattern name (e.g. "Blue Gem")
                            // The script expects 'patternName'
                            patternName: p.patternName || p.name
                        })) : []
                    }))
                };
                console.log(`Loaded ${specialPatternsData.skins.length} skins with special patterns`);
                return true;
            } else {
                console.warn('Loaded data but could not find valid skins/skingroups array:', data);
                return false;
            }

        } catch (error) {
            console.error('Failed to fetch patterns data:', error);
            return false;
        }
    }

    // Inject CSS styles
    function injectStyles() {
        if (document.getElementById('pattern-styles')) return;

        const style = document.createElement('style');
        style.id = 'pattern-styles';
        style.textContent = `
            .pattern-text {
                background: ${patternScriptConfig.textColor} !important;
                background-size: 200% 200% !important;
                -webkit-background-clip: text !important;
                -webkit-text-fill-color: transparent !important;
                background-clip: text !important;
            }
        `;
        document.head.appendChild(style);
    }

    function extractWeaponNames() {
        const weaponNames = [];

        // Extract from rare items list (knives) - they're already properly formatted in the HTML
        const rareItemsCard = document.querySelector('[style*="color:#FCC419"], [style*="color: rgb(252, 196, 25)"]')?.closest('[class*="mantine-Card-root"]');
        if (rareItemsCard) {
            const scrollArea = rareItemsCard.querySelector('[class*="mantine-ScrollArea-viewport"]');
            if (scrollArea) {
                const weaponElements = scrollArea.querySelectorAll('p[data-size="xs"]');
                console.log('Found rare items elements:', weaponElements.length);
                weaponElements.forEach(element => {
                    const weaponName = element.textContent.trim();
                    console.log('Rare item found:', weaponName);
                    // Knives are already properly formatted, just add them directly
                    if (weaponName &&
                        weaponName.length > 3 &&
                        !weaponNames.includes(weaponName)) {
                        weaponNames.push(weaponName);
                    }
                });
            }
        } else {
            console.log('Rare items card not found');
        }

        // Extract from regular weapon cards
        const weaponCards = document.querySelectorAll('[class*="mantine-Card-root"]');
        console.log('Found total cards:', weaponCards.length);

        weaponCards.forEach((card, index) => {
            // Skip the rare items card
            if (card.querySelector('[style*="color:#FCC419"], [style*="color: rgb(252, 196, 25)"]')) {
                return;
            }

            const weaponNameElements = card.querySelectorAll('[class*="mantine-Center-root"] p[class*="mantine-Text-root"]');
            console.log(`Card ${index} weapon name elements:`, weaponNameElements.length);

            if (weaponNameElements.length >= 2) {
                const weaponType = weaponNameElements[0].textContent.trim();
                const skinName = weaponNameElements[1].textContent.trim();

                // Properly format with " | " separator (space after pipe)
                const fullName = `${weaponType} | ${skinName}`;
                console.log(`Extracted: "${weaponType}" + "${skinName}" = "${fullName}"`);

                if (!weaponNames.includes(fullName)) {
                    weaponNames.push(fullName);
                }
            }
        });

        return weaponNames;
    }

    function findMatchingPatterns(weaponNames) {
        if (!specialPatternsData || !specialPatternsData.skins) {
            console.log('Patterns data not loaded properly');
            return [];
        }

        const matches = [];
        console.log('Searching for patterns in:', weaponNames);

        weaponNames.forEach(weaponName => {
            console.log(`Checking weapon: "${weaponName}"`);

            // Find exact match only
            const matchedSkin = specialPatternsData.skins.find(skin => {
                // Exact match comparison
                const exactMatch = skin.skinName.toLowerCase() === weaponName.toLowerCase();

                // Also check if both parts match exactly (for cases where formatting might differ)
                const weaponParts = weaponName.split(' | ').map(p => p.trim().toLowerCase());
                const skinParts = skin.skinName.split(' | ').map(p => p.trim().toLowerCase());

                const partsMatch = weaponParts.length === 2 &&
                                  skinParts.length === 2 &&
                                  weaponParts[0] === skinParts[0] &&
                                  weaponParts[1] === skinParts[1];

                console.log(`  Comparing with "${skin.skinName}": exact=${exactMatch}, parts=${partsMatch}`);

                return exactMatch || partsMatch;
            });

            if (matchedSkin) {
                console.log(`  ✓ Found match: ${matchedSkin.skinName}`);
                if (!matches.find(m => m.skinName === matchedSkin.skinName)) {
                    matches.push(matchedSkin);
                }
            }
        });

        console.log('Final matches found:', matches.length);
        return matches;
    }

    function createPatternsDisplay(matchedSkins) {
        if (matchedSkins.length === 0) return null;

        // Inject styles
        injectStyles();

        // Main container
        const patternsSection = document.createElement('div');
        patternsSection.style.cssText = `
            margin-bottom: 20px;
        `;

        // Create grid container like the website
        const gridContainer = document.createElement('div');
        gridContainer.className = 'm_410352e9 mantine-Grid-root';
        gridContainer.style.cssText = `--grid-gutter: var(--mantine-spacing-xs);`;

        const gridInner = document.createElement('div');
        gridInner.className = 'm_dee7bd2f mantine-Grid-inner';

        let allPatterns = [];
        matchedSkins.forEach(skin => {
            skin.patterns.forEach(pattern => {
                allPatterns.push({
                    ...pattern,
                    skinName: skin.skinName
                });
            });
        });

        allPatterns.forEach(pattern => {
            // Create column
            const col = document.createElement('div');
            col.className = 'm_96bdd299 mantine-Grid-col';
            col.style.cssText = `
                --col-flex-grow: 1;
                --col-flex-basis: 0rem;
                --col-max-width: 100%;
            `;

            // Create card (copy exact styling from website)
            const card = document.createElement('div');
            card.className = 'm_e615b15f mantine-Card-root m_1b7284a3 mantine-Paper-root';
            card.style.cssText = `
                background-color: #25262b;
                display: flex;
                flex-direction: column;
                border-color: dark.04;
                min-width: calc(15.9375rem * var(--mantine-scale));
                height: 100%;
            `;

            // Image section
            const imageSection = document.createElement('div');
            imageSection.className = 'm_599a2148 mantine-Card-section';
            imageSection.setAttribute('data-first-section', 'true');

            // Handle image source: try existing imageSrc or construct from iconUrl
            const imgSrc = pattern.imageSrc || (pattern.iconUrl ? `https://case-clicker.com/pictures/skins/${pattern.iconUrl}` : null);

            if (imgSrc) {
                const img = document.createElement('img');
                img.src = imgSrc;
                img.className = 'm_9e117634 mantine-Image-root';
                img.style.cssText = `
                    --image-object-fit: contain;
                    height: calc(6.25rem * var(--mantine-scale));
                `;
                img.alt = pattern.patternName;
                img.onerror = () => {
                    img.style.display = 'none';
                };
                imageSection.appendChild(img);
            }

            // Weapon name (split like the website does)
            const weaponParts = pattern.skinName.split(' | ');

            const weaponTypeCenter = document.createElement('div');
            weaponTypeCenter.className = 'm_4451eb3a mantine-Center-root';
            const weaponTypeText = document.createElement('p');
            weaponTypeText.className = 'mantine-focus-auto m_b6d8b162 mantine-Text-root pattern-text';
            weaponTypeText.textContent = weaponParts[0] + ' ';
            weaponTypeCenter.appendChild(weaponTypeText);

            const skinNameCenter = document.createElement('div');
            skinNameCenter.className = 'm_4451eb3a mantine-Center-root';
            const skinNameText = document.createElement('p');
            skinNameText.className = 'mantine-focus-auto m_b6d8b162 mantine-Text-root pattern-text';
            skinNameText.textContent = ' ' + (weaponParts[1] || '');
            skinNameCenter.appendChild(skinNameText);

            // Pattern name with styling
            const patternNameCenter = document.createElement('div');
            patternNameCenter.className = 'm_4451eb3a mantine-Center-root';
            const patternNameText = document.createElement('p');
            patternNameText.className = 'mantine-focus-auto m_b6d8b162 mantine-Text-root pattern-text';
            patternNameText.style.cssText = `
                color: #EFBF04 !important;
                --text-fz: var(--mantine-font-size-s);
                --text-lh: var(--mantine-line-height-xs);
                margin-top: calc(0.3125rem * var(--mantine-scale));
                font-weight: bold;
            `;
            patternNameText.setAttribute('data-size', 'xs');
            patternNameText.textContent = pattern.patternName;
            patternNameCenter.appendChild(patternNameText);

            // Overpay section (styled like Price Range)
            const overpayLabelCenter = document.createElement('div');
            overpayLabelCenter.className = 'm_4451eb3a mantine-Center-root';
            const overpayLabel = document.createElement('p');
            overpayLabel.className = 'mantine-focus-auto m_b6d8b162 mantine-Text-root';
            overpayLabel.style.cssText = `
                --text-fz: var(--mantine-font-size-xs);
                --text-lh: var(--mantine-line-height-xs);
                margin-top: calc(0.3125rem * var(--mantine-scale));
            `;
            overpayLabel.setAttribute('data-size', 'xs');
            overpayLabel.textContent = 'Overpay Value';
            overpayLabelCenter.appendChild(overpayLabel);

            const overpayGroup = document.createElement('div');
            overpayGroup.className = 'm_4081bf90 mantine-Group-root';
            overpayGroup.style.cssText = `
                --group-gap: var(--mantine-spacing-md);
                --group-align: center;
                --group-justify: center;
                --group-wrap: wrap;
            `;

            const overpayBadge = document.createElement('div');
            overpayBadge.className = 'm_fbd81e3d m_347db0ec mantine-Badge-root';
            overpayBadge.setAttribute('data-variant', 'dot');
            overpayBadge.style.cssText = '--badge-dot-color: var(--mantine-color-green-filled);';

            const overpaySpan = document.createElement('span');
            overpaySpan.className = 'm_5add502a mantine-Badge-label';
            // Format overpay as currency
            const formatCurrency = (value) => {
                const num = parseFloat(value.toString().replace(' overpay', ''));
                const isNegative = num < 0;
                const absNum = Math.abs(num);
                const formatted = absNum.toLocaleString('en-US', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0
                });
                return isNegative ? `-$${formatted}` : `$${formatted}`;
            };
            if (pattern.overpay) {
                overpaySpan.textContent = formatCurrency(pattern.overpay);
            } else {
                overpaySpan.textContent = '$0';
            }
            overpayBadge.appendChild(overpaySpan);
            overpayGroup.appendChild(overpayBadge);

            // Chance section (styled like Float Range)
            const chanceLabelCenter = document.createElement('div');
            chanceLabelCenter.className = 'm_4451eb3a mantine-Center-root';
            const chanceLabel = document.createElement('p');
            chanceLabel.className = 'mantine-focus-auto m_b6d8b162 mantine-Text-root';
            chanceLabel.style.cssText = `
                --text-fz: var(--mantine-font-size-xs);
                --text-lh: var(--mantine-line-height-xs);
                margin-top: calc(0.3125rem * var(--mantine-scale));
            `;
            chanceLabel.setAttribute('data-size', 'xs');
            chanceLabel.textContent = 'Rarity';
            chanceLabelCenter.appendChild(chanceLabel);

            const chanceGroup = document.createElement('div');
            chanceGroup.className = 'm_4081bf90 mantine-Group-root';
            chanceGroup.style.cssText = `
                --group-gap: var(--mantine-spacing-md);
                --group-align: center;
                --group-justify: center;
                --group-wrap: wrap;
            `;

            const chanceBadge = document.createElement('div');
            chanceBadge.className = 'm_fbd81e3d m_347db0ec mantine-Badge-root';
            chanceBadge.setAttribute('data-variant', 'dot');
            chanceBadge.style.cssText = '--badge-dot-color: var(--mantine-color-orange-filled);';

            const chanceSpan = document.createElement('span');
            chanceSpan.className = 'm_5add502a mantine-Badge-label';

            // Check if probability exists and format it as chance if not a string string already
            let chanceText = "Unknown";
            if (pattern.probability) {
                // If it's a raw number like 1000, we might want to display it as is or map it
                // For now, just display the value
                chanceText = pattern.probability.toString().replace(' chance', '');
            } else if (pattern.chance) {
                chanceText = pattern.chance.replace(' chance', '');
            }

            chanceSpan.textContent = '1/' + chanceText;
            chanceBadge.appendChild(chanceSpan);
            chanceGroup.appendChild(chanceBadge);

            // Final spacer
            const finalGroup = document.createElement('div');
            finalGroup.className = 'm_4081bf90 mantine-Group-root';
            finalGroup.style.cssText = `
                --group-gap: var(--mantine-spacing-md);
                --group-align: center;
                --group-justify: center;
                --group-wrap: wrap;
            `;

            // Assemble the card
            card.appendChild(imageSection);
            card.appendChild(weaponTypeCenter);
            card.appendChild(skinNameCenter);
            card.appendChild(patternNameCenter);
            card.appendChild(overpayLabelCenter);
            card.appendChild(overpayGroup);
            card.appendChild(chanceLabelCenter);
            card.appendChild(chanceGroup);
            card.appendChild(finalGroup);

            col.appendChild(card);
            gridInner.appendChild(col);
        });

        gridContainer.appendChild(gridInner);
        patternsSection.appendChild(gridContainer);
        return patternsSection;
    }

    function injectPatternsDisplay() {
        // Check if we're on a cases page
        if (!isOnCasesPage()) {
            console.log('Not on a cases page, skipping pattern injection');
            // Remove any existing pattern display if we navigated away
            const existingDisplay = document.querySelector('#patterns-display');
            if (existingDisplay) {
                existingDisplay.remove();
            }
            return true; // Return true to stop retrying
        }

        // Check if patterns data is loaded
        if (!specialPatternsData) {
            console.log('Patterns data not loaded yet, skipping injection');
            return false;
        }

        // Find the "Content" heading and insert after it
        const contentHeading = document.querySelector('h2[data-order="2"]') ||
                              Array.from(document.querySelectorAll('h2')).find(h2 => h2.textContent.trim() === 'Content');

        if (!contentHeading) {
            console.log('Content heading not found, retrying...');
            return false;
        }

        // Check if we already injected the patterns
        if (document.querySelector('#patterns-display')) {
            return true;
        }

        const weaponNames = extractWeaponNames();
        console.log('Extracted weapon names:', weaponNames);

        const matchedSkins = findMatchingPatterns(weaponNames);
        console.log('Matched skins with patterns:', matchedSkins);

        if (matchedSkins.length > 0) {
            const patternsDisplay = createPatternsDisplay(matchedSkins);
            if (patternsDisplay) {
                patternsDisplay.id = 'patterns-display';
                // Insert after the Content heading
                contentHeading.parentNode.insertBefore(patternsDisplay, contentHeading.nextSibling);
                console.log('Patterns display injected successfully after Content heading');
            }
        } else {
            console.log('No matching patterns found');
        }

        return true;
    }

    // Function to handle URL changes
    function handleURLChange() {
        const newURL = window.location.href;
        if (newURL !== currentURL) {
            console.log('URL changed from', currentURL, 'to', newURL);
            currentURL = newURL;

            // Remove existing patterns display
            const existingDisplay = document.querySelector('#patterns-display');
            if (existingDisplay) {
                existingDisplay.remove();
            }

            // Only try to inject patterns if we're on a cases page
            if (isOnCasesPage()) {
                // Try to inject patterns again after a short delay
                setTimeout(() => {
                    injectPatternsDisplay();
                }, 1000);
            }
        }
    }

    // Watch for URL changes
    function startURLWatcher() {
        // Watch for pushState and replaceState
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

        history.pushState = function(...args) {
            originalPushState.apply(history, args);
            setTimeout(handleURLChange, 100);
        };

        history.replaceState = function(...args) {
            originalReplaceState.apply(history, args);
            setTimeout(handleURLChange, 100);
        };

        // Watch for popstate events
        window.addEventListener('popstate', handleURLChange);

        // Poll for URL changes as backup
        setInterval(handleURLChange, 2000);
    }

    // Wait for page load and try to inject
    async function initialize() {
        // Start URL watcher
        startURLWatcher();

        // First, fetch the patterns data
        const dataLoaded = await fetchPatternsData();
        if (!dataLoaded) {
            console.log('Failed to load patterns data, script will not work');
            return;
        }

        // Only proceed if we're on a cases page
        if (!isOnCasesPage()) {
            console.log('Not on a cases page, waiting for navigation');
            return;
        }

        if (injectPatternsDisplay()) {
            return;
        }

        // If not successful, set up observer to wait for content
        const observer = new MutationObserver((mutations, obs) => {
            if (injectPatternsDisplay()) {
                obs.disconnect();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Fallback timeout
        setTimeout(() => {
            observer.disconnect();
            injectPatternsDisplay();
        }, 5000);
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

})();
