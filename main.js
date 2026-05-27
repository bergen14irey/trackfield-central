// Mobile menu toggle
document.addEventListener('DOMContentLoaded', function() {
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');
    
    // Mobile hamburger: open/close navigation menu
    if (hamburger) {
        hamburger.addEventListener('click', function() {
            hamburger.classList.toggle('active');
            navMenu.classList.toggle('active');
        });

        // Close mobile menu when a navigation link is clicked
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', function() {
                hamburger.classList.remove('active');
                navMenu.classList.remove('active');
            });
        });
    }

    // If this is the records page (has running section), load records
    const runningSection = document.getElementById('running-section');
    if (runningSection) {
        loadAthleteRecords();
    }
    
    // Default backend base URL (Render deployment). When testing locally
    // you can change or clear this to use `athletes.json` fallback.
    window.API_BASE_URL = 'https://trackandfield-central.onrender.com';

    // Wire up search/filter UI for the Records view
    const eventSearch = document.getElementById('eventSearch');
    const clearSearch = document.getElementById('clearSearch');

    if (eventSearch) {
        eventSearch.addEventListener('input', filterTable);
        clearSearch.addEventListener('click', clearTableFilter);
        // group select (category filter)
        const groupSelect = document.getElementById('groupSelect');
        if (groupSelect) groupSelect.addEventListener('change', filterTable);
    }
    // Initialize event autocomplete dropdown (fetches /api/events)
    setupEventAutocomplete();
})

// Extract event distance in meters from event name
// Parse a numeric distance (in meters) from an event name.
// Examples:
//  - "5k" => 5000
//  - "400m" or "400" => 400
//  - "steeplechase 3000" => 3000
// Returns integer meters or null when not parsable.
function getEventDistance(eventName) {
    const name = eventName.toLowerCase();
    
    // Handle "k" suffix (1k, 3k, 4k, 5k -> 1000, 3000, 4000, 5000)
    const kMatch = name.match(/^(\d+)k$/);
    if (kMatch) {
        return parseInt(kMatch[1], 10) * 1000;
    }
    
    // Handle plain numbers (60, 100, 200, 300, 400, 500, 600, 800, 1500, 3200)
    const numMatch = name.match(/^(\d+)$/);
    if (numMatch) {
        return parseInt(numMatch[1], 10);
    }
    
    // Handle "Xm" or "X meter" format (60m, 100m, 200m, 800m, etc.) and hurdles
    const mMatch = name.match(/(\d+)\s*(?:m|hurdles?)/);
    if (mMatch) {
        return parseInt(mMatch[1], 10);
    }
    
    return null;
}

// Categorize event into group
// Map an event name to a high-level category used for grouping in the UI.
// Returns one of: 'multi', 'jumping', 'throwing', or 'running' (default).
function categorizeEvent(eventName) {
    const name = eventName.toLowerCase();
    
    // Multi-event
    if (name.includes('heptathlon') || name.includes('decathlon')) {
        return 'multi';
    }
    
    // Jumping
    if (name.includes('jump') || name.includes('vault') || name.includes('high') || name.includes('long') || name.includes('triple')) {
        return 'jumping';
    }
    
    // Throwing
    if (name.includes('shot') || name.includes('discus') || name.includes('javelin') || name.includes('throw')) {
        return 'throwing';
    }
    
    // Running (default for sprints, distance, hurdles)
    return 'running';
}

// -------------------------
// Main data loading and rendering for Records page
// Responsibilities:
//  - Fetch records from the backend `/api/records` when available
//  - Fallback to `athletes.json` when running as static files
//  - Merge a locally stored pending submission (optimistic UI)
//  - Categorize records into sections (running, jumping, throwing, multi)
//  - Group by event and sort both events and individual performances
//  - Populate the DOM tables for each event
async function loadAthleteRecords() {
    try {
        // Try backend API first (works when the Express server is running)
        let athletes = null;
        const apiUrl = (window.API_BASE_URL || '') + '/api/records';
        try {
            const response = await fetch(apiUrl);
            console.debug('loadAthleteRecords: GET', apiUrl, 'status', response.status);
            if (response.ok) {
                athletes = await response.json();
            } else {
                console.info('loadAthleteRecords:', apiUrl, 'returned non-ok status', response.status);
            }
        } catch (apiErr) {
            // Network or CORS errors will land here; continue to fallback
            console.info('loadAthleteRecords: could not reach', apiUrl, apiErr && apiErr.message);
        }

        // Fallback to local JSON when no API available (useful for GitHub Pages without a backend)
        if (!Array.isArray(athletes) || athletes.length === 0) {
            try {
                const localResp = await fetch('athletes.json');
                if (localResp.ok) {
                    athletes = await localResp.json();
                    console.debug('loadAthleteRecords: loaded athletes.json fallback, count=', Array.isArray(athletes) ? athletes.length : 0);
                } else {
                    console.info('loadAthleteRecords: athletes.json fetch returned non-ok', localResp.status);
                }
            } catch (localErr) {
                console.warn('loadAthleteRecords: failed to fetch athletes.json fallback', localErr && localErr.message);
            }
        }

        // Merge any pending local submission saved during a recent POST so the user sees their entry immediately
        try {
            const pendingRaw = localStorage.getItem('lastSubmission');
            if (pendingRaw) {
                const pendingObj = JSON.parse(pendingRaw);
                const exists = Array.isArray(athletes) && athletes.some(a =>
                    a.athlete === pendingObj.athlete && a.event === pendingObj.event && (a.pr_text === pendingObj.pr_text || String(a.pr_value) === String(pendingObj.pr_value))
                );
                if (!exists) {
                    athletes = Array.isArray(athletes) ? athletes.concat(pendingObj) : [pendingObj];
                }
                // Remove pending after merging so it doesn't persist indefinitely
                localStorage.removeItem('lastSubmission');
            }
        } catch (e) {
            console.warn('Could not merge pending submission', e);
        }

        if (!Array.isArray(athletes) || athletes.length === 0) {
            populateEmptySections();
            console.info('loadAthleteRecords: no records available from API or athletes.json');
            return;
        }
        
        // Build categorized buckets for display. These are used to show logical sections
        // on the Records page (Sprints, Hurdles, Distance, etc.).
        const categorized = {
            running: [],
            'short-distance': [],
            'long-distance': [],
            'cross-country': [],
            'hurdles': [],
            throwing: [],
            jumping: [],
            multi: []
        };
        
        // Assign each record to a category. Running events are further sub-categorized
        // based on distance and whether they are hurdles/steeplechase.
        athletes.forEach(record => {
            const category = categorizeEvent(record.event);
            if (category === 'running') {
                const eventName = record.event.toLowerCase();
                if (eventName.includes('hurdle') || eventName.includes('steeplechase')) {
                    categorized['short-distance'].push(record);
                } else if (eventName.includes('marathon') || eventName.includes('half marathon')) {
                    categorized['cross-country'].push(record);
                } else {
                    const distance = getEventDistance(record.event);
                    if (distance !== null && distance >= 3000) {
                        categorized['cross-country'].push(record);
                    } else if (distance !== null && distance >= 800) {
                        categorized['long-distance'].push(record);
                    } else {
                        categorized['running'].push(record);
                    }
                }
            } else {
                categorized[category].push(record);
            }
        });

        // Group records by specific event name for table rendering
        const eventGroups = {};
        athletes.forEach(record => {
            const eventName = record.event;
            if (!eventGroups[eventName]) {
                eventGroups[eventName] = [];
            }
            eventGroups[eventName].push(record);
        });

        // Map each event name to a display category so we can reorder DOM
        // subsections to match numeric ordering.
        const eventCategoryMap = {};
        Object.keys(eventGroups).forEach(eventName => {
            const baseCategory = categorizeEvent(eventName);
            if (baseCategory !== 'running') {
                eventCategoryMap[eventName] = baseCategory;
            } else {
                // Running into short-distance, long-distance, cross-country
                const en = eventName.toLowerCase();
                if (en.includes('hurdle') || en.includes('steeplechase')) {
                    eventCategoryMap[eventName] = 'short-distance';
                } else if (en.includes('marathon') || en.includes('half marathon')) {
                    eventCategoryMap[eventName] = 'cross-country';
                } else {
                    const d = getEventDistance(eventName);
                    if (d !== null && d >= 3000) eventCategoryMap[eventName] = 'cross-country';
                    else if (d !== null && d >= 800) eventCategoryMap[eventName] = 'long-distance';
                    else eventCategoryMap[eventName] = 'running';
                }
            }
        });

        // Sort function for the rows inside each event table. It decides whether
        // higher is better (throws/jumps) or lower is better (times) and sorts accordingly.
        const sortByPerformance = (a, b) => {
            const clean = str => typeof str === 'string' ? parseFloat(str.replace(/[^\d.]/g, '')) : NaN;
            const prA = clean(a.pr_text || a.pr_value || a.pr);
            const prB = clean(b.pr_text || b.pr_value || b.pr);
            if (!isNaN(prA) && !isNaN(prB)) {
                const eventLower = a.event.toLowerCase();
                if (eventLower.includes('jump') || eventLower.includes('vault')) return prB - prA;
                if (eventLower.includes('shot') || eventLower.includes('discus') || eventLower.includes('javelin')) return prB - prA;
                if (eventLower.includes('heptathlon') || eventLower.includes('decathlon')) return prB - prA;
                return prA - prB; // running: lower is better
            }
            return 0;
        };

        // Hide all subsections initially; we'll reveal those that contain data
        document.querySelectorAll('.event-subsection').forEach(subsection => {
            subsection.style.display = 'none';
        });

        // Parse event name to a sortable numeric distance when possible
        const parseDistanceForSort = name => {
            if (!name || typeof name !== 'string') return Number.MAX_SAFE_INTEGER;
            const n = name.toLowerCase().trim();
            const kMatch = n.match(/(\d+)\s*k$/);
            if (kMatch) return parseInt(kMatch[1], 10) * 1000;
            const mMatch = n.match(/(\d+)(?=\s*(?:m|$))/);
            if (mMatch) return parseInt(mMatch[1], 10);
            return Number.MAX_SAFE_INTEGER;
        };

        // Order events numerically by distance where possible, otherwise alphabetically
        const eventNamesSorted = Object.keys(eventGroups).sort((a, b) => {
            const distA = parseDistanceForSort(a);
            const distB = parseDistanceForSort(b);
            if (distA !== distB) return distA - distB;
            return String(a).localeCompare(String(b));
        });

        // Reorder event subsections in the DOM to match our sorted event order,
        // grouped by category so Sprints/Hurdles/Distance sections show events
        // in logical numeric order instead of the static HTML order.
        const categories = ['running', 'short-distance', 'long-distance', 'cross-country', 'throwing', 'jumping', 'multi'];
        categories.forEach(category => {
            const container = document.getElementById(category + '-section');
            if (!container) return;
            // Find event names for this category in sorted order
            const namesForCategory = eventNamesSorted.filter(name => eventCategoryMap[name] === category);
            namesForCategory.forEach(evtName => {
                // Find the subsection element with matching data-event attribute
                const subsections = Array.from(container.querySelectorAll('.event-subsection'));
                const sub = subsections.find(s => s.getAttribute('data-event') === evtName);
                if (sub) container.appendChild(sub); // move into sorted order
            });
        });

        // Populate DOM tables for each event in sorted order
        eventNamesSorted.forEach(eventName => {
            eventGroups[eventName].sort(sortByPerformance);
            populateEventTable(eventName, eventGroups[eventName]);
        });
        
    } catch (error) {
        console.error('Error loading athlete records:', error);
        populateEmptySections('Error loading records: ' + escapeHtml(error.message));
    }
}

// Convert an event name into a safe CSS class fragment used for tbody selectors.
// e.g., "400 m" -> "400-m"
function eventToClassName(eventName) {
    return eventName.toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[()]/g, '');
}

// Populate the HTML table body for a single event with `records`.
// Shows/hides the event subsection depending on data presence and
// appends a table row for each record.
function populateEventTable(eventName, records) {
    const className = eventToClassName(eventName);
    const tbody = document.querySelector(`.event-tbody-${className}`);
    
    if (!tbody) {
        console.warn(`No tbody found for event: ${eventName} (class: event-tbody-${className})`);
        return;
    }
    
    // Find the parent event subsection
    const subsection = tbody.closest('.event-subsection');
    
    if (records.length === 0) {
        // Hide the entire event subsection if no records
        if (subsection) {
            subsection.style.display = 'none';
        }
        return;
    }
    
    // Show the subsection if it has records
    if (subsection) {
        subsection.style.display = 'block';
    }
    
    tbody.innerHTML = '';
    
    records.forEach(record => {
        const genderLabel = record.gender === 'M' ? 'Male' : record.gender === 'W' ? 'Female' : (record.gender || '-');
        const dateFormatted = record.pr_date ? new Date(record.pr_date).toLocaleDateString() : '-';
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${escapeHtml(record.pr_text || record.pr_value || record.pr)}</td>
            <td>${escapeHtml(record.athlete)}</td>
            <td>${escapeHtml(dateFormatted)}</td>
            <td>${escapeHtml(genderLabel)}</td>
        `;
        tbody.appendChild(row);
    });
}

// Escape text to safe HTML to avoid injection when inserting into innerHTML
function escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str).replace(/[&<>"']/g, function (s) {
        return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[s];
    });
}

// Autocomplete utilities for the event search input on the Records page.
// `allEvents` stores the list fetched from `/api/events` and the
// dropdown is rendered by `showEventSuggestions`.
let allEvents = [];
async function setupEventAutocomplete() {
    try {
        const apiUrl = (window.API_BASE_URL || '') + '/api/events';
        const res = await fetch(apiUrl);
        if (!res.ok) return;
        allEvents = await res.json();
        
        // Attach autocomplete listeners to event search input on records page only
        const searchInput = document.getElementById('eventSearch');
        
        if (searchInput) {
            searchInput.addEventListener('input', showEventSuggestions);
            searchInput.addEventListener('focus', showEventSuggestions);
            searchInput.addEventListener('blur', () => {
                setTimeout(() => hideEventSuggestions(), 200);
            });
        }
    } catch (e) {
        console.error('Could not load events for autocomplete', e);
    }
}

// Render the autocomplete dropdown under the event search input and
// wire up click-to-select behavior for suggestions.
function showEventSuggestions(e) {
    const input = e.target;
    const value = input.value.toLowerCase().trim();
    
    // Find or create dropdown container
    let dropdown = document.getElementById('event-dropdown');
    if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.id = 'event-dropdown';
        dropdown.className = 'event-dropdown';
        input.parentNode.insertBefore(dropdown, input.nextSibling);
    }
    
    if (!value) {
        dropdown.innerHTML = '';
        dropdown.style.display = 'none';
        return;
    }
    
    const filtered = allEvents.filter(evt => evt.toLowerCase().includes(value));
    if (filtered.length === 0) {
        dropdown.style.display = 'none';
        return;
    }
    
    dropdown.innerHTML = filtered.map(evt => `<div class="event-option">${escapeHtml(evt)}</div>`).join('');
    dropdown.style.display = 'block';
    
    // Attach click handlers to options
    dropdown.querySelectorAll('.event-option').forEach(opt => {
        opt.addEventListener('click', () => {
            input.value = opt.textContent;
            dropdown.style.display = 'none';
        });
    });
}

// Hide the event suggestion dropdown.
function hideEventSuggestions() {
    const dropdown = document.getElementById('event-dropdown');
    if (dropdown) dropdown.style.display = 'none';
}

// Filter visible event subsections by the search input and category selector.
// Hides subsections that don't match the current text/group selection.
function filterTable() {
    const searchInput = document.getElementById('eventSearch').value.toLowerCase().trim();
    const groupSelect = document.getElementById('groupSelect');
    const selectedGroup = (groupSelect && groupSelect.value) || 'all';

    const sections = {
        'running': document.getElementById('running-section'),
        'short-distance': document.getElementById('short-distance-section'),
        'long-distance': document.getElementById('long-distance-section'),
        'cross-country': document.getElementById('cross-country-section'),
        'throwing': document.getElementById('throwing-section'),
        'jumping': document.getElementById('jumping-section'),
        'multi': document.getElementById('multi-section')
    };

    Object.entries(sections).forEach(([key, section]) => {
        if (!section) return;
        
        const matchesGroup = (selectedGroup === 'all' || selectedGroup === key);
        
        // Get all event subsections within this category section
        const eventSubsections = section.querySelectorAll('.event-subsection');
        let sectionHasMatch = false;

        eventSubsections.forEach(subsection => {
            const eventName = subsection.getAttribute('data-event');
            const matchesSearch = !searchInput || eventName.toLowerCase().includes(searchInput);

            if (matchesSearch && matchesGroup) {
                subsection.style.display = 'block';
                sectionHasMatch = true;
            } else {
                subsection.style.display = 'none';
            }
        });

        // Hide entire category section if no matches
        if (!sectionHasMatch || !matchesGroup) {
            section.style.display = 'none';
        } else {
            section.style.display = 'block';
        }
    });
}

// Clear the search and group filters and reveal all sections/subsections.
function clearTableFilter() {
    document.getElementById('eventSearch').value = '';
    document.getElementById('groupSelect').value = 'all';
    
    // Show all category sections
    ['running', 'short-distance', 'long-distance', 'cross-country', 'throwing', 'jumping', 'multi'].forEach(category => {
        const section = document.getElementById(category + '-section');
        if (section) {
            section.style.display = 'block';
            // Show all event subsections within this category
            const subsections = section.querySelectorAll('.event-subsection');
            subsections.forEach(subsection => {
                subsection.style.display = 'block';
            });
        }
    });
}

// Validate form inputs before submission. Adds inline error messages
// and returns `true` when the form is valid, `false` otherwise.
function validateForm(formId) {
    const form = document.getElementById(formId);
    if (!form) return true;

    let isValid = true;
    const inputs = form.querySelectorAll('input, textarea, select');

    inputs.forEach(input => {
        const formGroup = input.closest('.form-group');
        const errorMessage = formGroup ? formGroup.querySelector('.error-message') : null;

        // Skip checkboxes and radio buttons for now (handled separately)
        if (input.type === 'checkbox' || input.type === 'radio') {
            return;
        }

        // Clear previous errors
        if (formGroup) {
            formGroup.classList.remove('has-error');
        }
        input.classList.remove('input-error');
        if (errorMessage) {
            errorMessage.textContent = '';
        }

        // Validate based on input type
        if (input.required && !input.value.trim()) {
            setError(input, 'This field is required.');
            isValid = false;
        } else if (input.value.trim().length < 3 && input.value.trim()) {
            setError(input, 'This field must be at least 3 characters.');
            isValid = false;
        }
    });

    // Validate gender radio buttons
    const genderInputs = form.querySelectorAll('input[name="gender"]');
    if (genderInputs.length) {
        const genderGroup = genderInputs[0].closest('.form-group');
        const genderError = genderGroup ? genderGroup.querySelector('.error-message') : null;
        if (genderGroup) genderGroup.classList.remove('has-error');
        if (genderError) genderError.textContent = '';

        const hasSelection = Array.from(genderInputs).some(input => input.checked);
        if (!hasSelection) {
            if (genderGroup) genderGroup.classList.add('has-error');
            if (genderError) genderError.textContent = 'Please select a gender.';
            isValid = false;
        }
    }

    return isValid;
}

// Mark a specific input as invalid and show `message` in the form UI.
function setError(input, message) {
    const formGroup = input.closest('.form-group');
    if (formGroup) {
        formGroup.classList.add('has-error');
        const errorMessage = formGroup.querySelector('.error-message');
        if (errorMessage) {
            errorMessage.textContent = message;
        }
    }
    input.classList.add('input-error');
}

// Handle form submission
document.addEventListener('DOMContentLoaded', function() {
    const registrationForm = document.getElementById('registrationForm');
    if (registrationForm) {
        registrationForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            if (!validateForm('registrationForm')) {
                return;
            }

            const formData = new FormData(registrationForm);
            const data = {
                athlete: formData.get('athlete'),
                gender: formData.get('gender'),
                event: formData.get('event'),
                pr_text: formData.get('pr_text') || '',
                pr_date: formData.get('pr_date') || '',
                pr_value: formData.get('pr_value'),
                pr_type: formData.get('pr_type'),
                unit: formData.get('unit') || '',
                note: formData.get('note') || ''
            };

            try {
                const apiUrl = (window.API_BASE_URL || '') + '/api/records';
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                });

                if (response.ok) {
                    // Save the submitted record to localStorage so Records page can show it immediately
                    try {
                        const pending = Object.assign({}, data);
                        pending.pr_text = pending.pr_text || String(pending.pr_value || '');
                        pending.created_at = new Date().toISOString();
                        pending._pending = true;
                        localStorage.setItem('lastSubmission', JSON.stringify(pending));
                    } catch (e) {
                        console.warn('Could not save lastSubmission', e);
                    }
                    registrationForm.reset();
                    // Ensure the success page resolves correctly regardless of GitHub Pages path
                    const successUrl = new URL('success.html', window.location.href).href;
                    window.location.href = successUrl;
                } else {
                    let errorMsg = 'There was an error submitting the form. Please try again.';
                    try {
                        const errorData = await response.json();
                        errorMsg = errorData.error || errorMsg;
                    } catch (e) {
                        // If response isn't JSON, use generic error
                    }
                    alert('Error: ' + errorMsg);
                }
            } catch (error) {
                console.error('Error:', error);
                const msg = error.message || 'Unknown error';
                alert('Unable to submit form. Please make sure:\n1. The backend server is deployed and running\n2. Your API_BASE_URL is set correctly in main.js\n3. Your internet connection is working\n\nError details: ' + msg);
            }
        });
    }
});
