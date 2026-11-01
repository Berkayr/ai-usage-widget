// Common consent/settings surface for every theme. DOM text nodes only.
export function mountProviders(parent, config, save, onSaved = () => {}) {
  parent.replaceChildren();
  const heading = document.createElement('h3');
  heading.textContent = config.initialized ? 'Choose what to track' : 'Choose what to track to get started';
  parent.append(heading);
  const choices = document.createElement('div');
  choices.className = 'provider-choices'; parent.append(choices);
  const checks = [];
  for (const [id, provider] of Object.entries(config.providers)) {
    if (!(id in config.disclosures)) continue;
    const label = document.createElement('label');
    label.className = 'provider-choice';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = config.initialized && provider.enabled;
    const text = document.createElement('span');
    text.textContent = `${id}${config.detected[id] ? ' (detected)' : ''}: ${config.disclosures[id]}`;
    label.append(input, text); choices.append(label); checks.push([id, input]);
  }
  const status = document.createElement('p');
  status.className = 'setting-note'; status.setAttribute('role', 'status');
  const button = document.createElement('button');
  button.textContent = config.initialized ? 'Save providers' : 'Start';
  button.onclick = async () => {
    button.disabled = true;
    try {
      await save(checks.filter(([, input]) => input.checked).map(([id]) => id));
      status.textContent = 'Provider choices saved.';
      await onSaved();
    } catch (error) { status.textContent = `Unable to save provider choices: ${error}`; }
    finally { button.disabled = false; }
  };
  const actions = document.createElement('div');
  actions.className = 'provider-consent-actions';
  actions.append(button, status); parent.append(actions);
}
