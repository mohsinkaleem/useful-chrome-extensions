function enhanceChatHistory() {
    // Selector for the table body where rows are added
    const tableBody = document.querySelector('table.library-table tbody.mdc-data-table__content');
    if (!tableBody) {
        console.log("AI Studio Enhancer: Table body not found yet.");
        return;
    }

    // Selector for the rows in the chat list
    const chatRows = tableBody.querySelectorAll('tr.mat-mdc-row:not(.enhancer-processed)');

    if (chatRows.length === 0) {
        console.log("AI Studio Enhancer: No new chat rows found to process.");
        return;
    }

    console.log(`AI Studio Enhancer: Found ${chatRows.length} new chat rows to process.`);

    chatRows.forEach(row => {
        row.classList.add('enhancer-processed'); // Mark as processed

        // --- 1. Full Title on Hover ---
        const nameCell = row.querySelector('td.mat-column-name');
        const nameButton = nameCell ? nameCell.querySelector('button.name-btn') : null;

        if (nameButton) {
            const fullTitle = nameButton.textContent ? nameButton.textContent.trim() : "Unknown Title";
            nameButton.setAttribute('title', fullTitle);
        } else {
            console.warn("AI Studio Enhancer: Name button not found for a row.", row);
            // return; // If no name button, we probably can't do much else for this row
        }

        // --- 2. "Open in New Tab" Button ---
        let chatUrl = null;

        // IMPORTANT: How to get the chat-specific URL?
        // The URL structure is: https://aistudio.google.com/app/prompts/CHAT_ID
        // We need to find CHAT_ID.
        // Try to find a data attribute on the row or name button that might hold the ID.
        // Common attributes could be data-id, data-prompt-id, or even just an id attribute.
        // You might need to inspect the element in DevTools to find the correct attribute.
        let promptId = null;
        if (row.dataset.promptId) { // e.g., <tr data-prompt-id="XYZ">
            promptId = row.dataset.promptId;
        } else if (nameButton && nameButton.dataset.promptId) { // e.g., <button data-prompt-id="XYZ">
            promptId = nameButton.dataset.promptId;
        }
        // Add more checks here if the ID is stored differently.
        // For debugging, let's log attributes of the row:
        console.log("Row attributes for potential ID:", row.attributes);


        // If we found a promptId, construct the URL
        if (promptId) {
            chatUrl = `https://aistudio.google.com/app/prompts/${promptId}`;
        } else {
            // FALLBACK: If no ID found, we can try to get the URL from an <a> tag if one exists
            // within the row that points to a prompt. This is less likely for button-based navigation.
            const promptLink = row.querySelector('a[href*="/app/prompts/"]');
            if (promptLink && promptLink.href) {
                chatUrl = promptLink.href;
            }
        }


        if (chatUrl) {
            const newTabButton = document.createElement('button');
            newTabButton.innerHTML = '↗'; // North-east arrow
            newTabButton.classList.add('enhancer-new-tab-button');
            newTabButton.title = 'Open in new tab';

            newTabButton.addEventListener('click', (event) => {
                event.preventDefault(); // Prevent default if it were a form button
                event.stopPropagation(); // Stop event from bubbling up to the row's original click handler
                window.open(chatUrl, '_blank').focus();
            });

            // Insert the button:
            // Find the "more options" cell (last cell in the row based on structure)
            const moreOptionsCell = row.querySelector('td.mat-column-overflow');
            if (moreOptionsCell) {
                const existingMoreButton = moreOptionsCell.querySelector('button.overflow-button');
                if (existingMoreButton) {
                    // Insert before the existing "more options" button for better alignment
                    existingMoreButton.parentNode.insertBefore(newTabButton, existingMoreButton);
                } else {
                    // Fallback if the specific button isn't found, just append to the cell
                    moreOptionsCell.appendChild(newTabButton);
                }
            } else if (nameCell) {
                // Fallback: if "more options" cell isn't found, append to name cell (less ideal)
                nameCell.appendChild(newTabButton);
                newTabButton.style.marginLeft = "5px"; // Add some spacing if appended here
            }
        } else {
            // console.warn("AI Studio Enhancer: Could not determine chat URL for row. 'Open in New Tab' button not added.", row);
            // To help debug, you can log the row's outerHTML:
            console.log("Row HTML (for debugging missing ID):", row.outerHTML);
        }
    });
}

// --- MutationObserver to detect dynamically loaded content ---
const observerTargetNode = document.body; // Observe the whole body, or a more specific container if identifiable
const observerConfig = { childList: true, subtree: true };

const observer = new MutationObserver((mutationsList, obs) => {
    let newRowsPotentiallyAdded = false;
    for (const mutation of mutationsList) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            mutation.addedNodes.forEach(node => {
                // Check if the added node is a row, or contains rows
                if (node.nodeType === Node.ELEMENT_NODE) {
                    if (node.matches && (node.matches('tr.mat-mdc-row') || node.querySelector('tr.mat-mdc-row'))) {
                        newRowsPotentiallyAdded = true;
                    }
                }
            });
        }
        // Also consider if rows are part of a larger structure that gets replaced
        if (mutation.target && mutation.target.nodeType === Node.ELEMENT_NODE &&
            mutation.target.matches && (mutation.target.matches('tbody.mdc-data-table__content') || mutation.target.querySelector('tbody.mdc-data-table__content'))) {
            newRowsPotentiallyAdded = true;
        }
    }

    if (newRowsPotentiallyAdded) {
        console.log("AI Studio Enhancer: Detected DOM changes, re-enhancing.");
        // Use a small delay to ensure Angular has finished rendering
        setTimeout(enhanceChatHistory, 100);
    }
});

// Start observing
if (observerTargetNode) {
    observer.observe(observerTargetNode, observerConfig);
} else {
    console.error("AI Studio Enhancer: Could not find observer target node.");
}

// Initial run + delayed runs for SPA loading
setTimeout(enhanceChatHistory, 500);
setTimeout(enhanceChatHistory, 1500);
setTimeout(enhanceChatHistory, 3000); // For pages that load content very late