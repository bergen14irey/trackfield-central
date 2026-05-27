// Mobile menu toggle
document.addEventListener('DOMContentLoaded', function() {
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');
    
    if (hamburger) {
        hamburger.addEventListener('click', function() {
            hamburger.classList.toggle('active');
            navMenu.classList.toggle('active');
        });

        // Close menu when a link is clicked
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', function() {
                hamburger.classList.remove('active');
                navMenu.classList.remove('active');
            });
        });
    }

    // Load athletes data from API
    const runningSection = document.getElementById('running-section');
    if (runningSection) {
        loadAthleteRecords();
    }
    
    // Set Render backend
    window.API_BASE_URL = 'https://trackandfield-central.onrender.com';

    // Search functionality for records table
    const eventSearch = document.getElementById('eventSearch');
    const clearSearch = document.getElementById('clearSearch');

    if (eventSearch) {
        eventSearch.addEventListener('input', filterTable);
        clearSearch.addEventListener('click', clearTableFilter);
        // group select
        const groupSelect = document.getElementById('groupSelect');
        if (groupSelect) groupSelect.addEventListener('change', filterTable);
    }
})

// Extract event distance in meters from event name
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

// Load athlete records from API
async function loadAthleteRecords() {
    try {
        // Prefer server API when available (used when running via node server.js)
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
            console.info('loadAthleteRecords: could not reach', apiUrl, apiErr && apiErr.message);
        }

        // Fallback to local static file for file:// or simple hosting scenarios
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

        if (!Array.isArray(athletes) || athletes.length === 0) {
            populateEmptySections();
            console.info('loadAthleteRecords: no records available from API or athletes.json');
            return;
        }
        
        // Organize records by category
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
        
        athletes.forEach(record => {
            const category = categorizeEvent(record.event);
            if (category === 'running') {
                // Sub-categorize running by event type
                const eventName = record.event.toLowerCase();
                
                // Hurdles (any hurdle distance) go to short distance (consider steeple a hurdle event)
                if (eventName.includes('hurdle') || eventName.includes('steeplechase')) {
                    categorized['short-distance'].push(record);
                } else if (eventName.includes('marathon') || eventName.includes('half marathon')) {
                    // Marathons and half marathons go to cross-country (long distance)
                    categorized['cross-country'].push(record);
                } else {
                    // Non-hurdle running events: categorize by distance
                    const distance = getEventDistance(record.event);
                    if (distance !== null && distance >= 3000) {
                        categorized['cross-country'].push(record);
                    } else if (distance !== null && distance >= 800) {
                        categorized['long-distance'].push(record);
                    } else {
                        // Default to running if distance not specified or other
                        categorized['running'].push(record);
                    }
                }
            } else {
                categorized[category].push(record);
            }
        });
        
        // Sort running events by distance (shortest to longest)
        const sortByDistanceThenEventThenPerformance = (a, b) => {
            // First sort by distance of event
            const distA = getEventDistance(a.event);
            const distB = getEventDistance(b.event);

            if (distA !== null && distB !== null) {
                if (distA !== distB) return distA - distB;
            } else if (distA !== null) {
                return -1; // a has distance, b doesn't
            } else if (distB !== null) {
                return 1; // b has distance, a doesn't
            }

            // Detects running events
            const aEvent = a.event.toLowerCase();
            const bEvent = b.event.toLowerCase();

            const isRunningA =
                aEvent.includes('m') ||
                aEvent.includes('meter') ||
                aEvent.includes('mile') ||
                aEvent.includes('hurdle') ||
                aEvent.includes('steeple');

            const isRunningB =
                bEvent.includes('m') ||
                bEvent.includes('meter') ||
                bEvent.includes('mile') ||
                bEvent.includes('hurdle') ||
                bEvent.includes('steeple');

            const clean = str =>
                typeof str === 'string'
                    ? parseFloat(str.replace(/[^\d.]/g, ''))
                    : NaN;

            //If running event, sort by PR FIRST
            if (isRunningA && isRunningB) {
                const prA = clean(a.pr);
                const prB = clean(b.pr);

                if (!isNaN(prA) && !isNaN(prB)) {
                    return prA - prB; // lower time is better
                }
            }

            // If running events, PR must override event name
            if (isRunningA && isRunningB) {
                const prA2 = clean(a.pr);
                const prB2 = clean(b.pr);
                if (!isNaN(prA2) && !isNaN(prB2)) {
                    return prA2 - prB2; // lower time is better
                }
            }

            // If same event, sort by performance (numeric value extracted from pr)
            const prA2 = clean(a.pr);
            const prB2 = clean(b.pr);

            // If both are valid numbers, sort numerically (descending for height/distance, ascending for time)
            if (!isNaN(prA2) && !isNaN(prB2)) {
                // For jumping events (higher is better), sort descending
                if (a.event.toLowerCase().includes('jump') || a.event.toLowerCase().includes('vault')) {
                    return prB2 - prA2;
                }
                // For throwing events (higher is better), sort descending
                if (a.event.toLowerCase().includes('shot') || a.event.toLowerCase().includes('discus') || a.event.toLowerCase().includes('javelin')) {
                    return prB2 - prA2;
                }
                // For running/hurdles (lower time is better), sort ascending
                else {
                    return prA2 - prB2;
                }
            }

            return 0;
        };
        
        // Group records by specific event
        const eventGroups = {};
        athletes.forEach(record => {
            const eventName = record.event;
            if (!eventGroups[eventName]) {
                eventGroups[eventName] = [];
            }
            eventGroups[eventName].push(record);
        });
        
        // Sort each event's records by performance
        const sortByPerformance = (a, b) => {
            const clean = str =>
                typeof str === 'string'
                    ? parseFloat(str.replace(/[^\d.]/g, ''))
                    : NaN;
            
            const prA = clean(a.pr_text || a.pr_value || a.pr);
            const prB = clean(b.pr_text || b.pr_value || b.pr);
            
            if (!isNaN(prA) && !isNaN(prB)) {
                const eventLower = a.event.toLowerCase();
                // For jumping/vault events (higher is better), sort descending
                if (eventLower.includes('jump') || eventLower.includes('vault')) {
                    return prB - prA;
                }
                // For throwing events (higher is better), sort descending
                if (eventLower.includes('shot') || eventLower.includes('discus') || eventLower.includes('javelin')) {
                    return prB - prA;
                }
                // For multi-events (higher is better), sort descending
                if (eventLower.includes('heptathlon') || eventLower.includes('decathlon')) {
                    return prB - prA;
                }
                // For running/hurdles (lower time is better), sort ascending
                return prA - prB;
            }
            
            return 0;
        };
        
        // First, hide all event subsections
        document.querySelectorAll('.event-subsection').forEach(subsection => {
            subsection.style.display = 'none';
        });
        
        // Sort events by distance, then alphabetically, before populating (keeps new events in order)
        const eventNamesSorted = Object.keys(eventGroups).sort((a, b) => {
            const distA = getEventDistance(a);
            const distB = getEventDistance(b);
            if (distA !== null && distB !== null && distA !== distB) return distA - distB;
            if (distA !== null && distB === null) return -1;
            if (distA === null && distB !== null) return 1;
            return a.localeCompare(b);
        });

        eventNamesSorted.forEach(eventName => {
            eventGroups[eventName].sort(sortByPerformance);
            populateEventTable(eventName, eventGroups[eventName]);
        });
        
    } catch (error) {
        console.error('Error loading athlete records:', error);
        populateEmptySections('Error loading records: ' + escapeHtml(error.message));
    }
}

function getCategoryLabel(category) {
    const labels = {
        'running': 'Sprints',
        'short-distance': 'Hurdles',
        'long-distance': 'Mid Distance',
        'cross-country': 'Long Distance',
        'throwing': 'Throwing',
        'jumping': 'Jumping',
        'multi': 'Multi-Event'
    };
    return labels[category] || category;
}

// Convert event name to tbody class name
function eventToClassName(eventName) {
    return eventName.toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[()]/g, '');
}

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

// Utility to escape HTML
function escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str).replace(/[&<>"']/g, function (s) {
        return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[s];
    });
}

// Autocomplete for event search: fetch distinct events and show custom dropdown
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

function hideEventSuggestions() {
    const dropdown = document.getElementById('event-dropdown');
    if (dropdown) dropdown.style.display = 'none';
}

// Call autocomplete setup on load
document.addEventListener('DOMContentLoaded', setupEventAutocomplete);

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

// Form validation
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
                    registrationForm.reset();
                    // Use a relative path so GitHub Pages resolves the page correctly
                    window.location.href = 'success.html';
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
