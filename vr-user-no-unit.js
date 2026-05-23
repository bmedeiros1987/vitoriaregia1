
// Vitória Régia v4.3.3 - Cadastro de usuário sem unidade vinculada
(function () {
  const VERSION = 'v4.3.3';

  const UNIT_SELECTORS = [
    'input[name="unidade"]',
    'select[name="unidade"]',
    'input[name="unit"]',
    'select[name="unit"]',
    'input[id*="unidade" i]',
    'select[id*="unidade" i]',
    'input[placeholder*="unidade" i]',
    'select[aria-label*="unidade" i]',
    'input[placeholder*="apartamento" i]',
    'select[aria-label*="apartamento" i]'
  ];

  const USER_FORM_HINTS = [
    'usuario', 'usuário', 'user', 'funcionario', 'funcionário',
    'morador', 'sindico', 'síndico', 'portaria', 'porteiro',
    'zeladoria', 'limpeza', 'administração', 'administracao'
  ];

  function norm(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function isUserForm(form) {
    const text = norm([
      form.getAttribute('id'),
      form.getAttribute('class'),
      form.getAttribute('name'),
      form.innerText
    ].join(' '));
    return USER_FORM_HINTS.some(h => text.includes(norm(h)));
  }

  function getUnitFields(scope) {
    return UNIT_SELECTORS
      .flatMap(sel => Array.from(scope.querySelectorAll(sel)))
      .filter((el, idx, arr) => arr.indexOf(el) === idx);
  }

  function findUnitContainer(field) {
    return field.closest('.form-group, .field, .input-group, label, .vr-field, .card, div') || field;
  }

  function applyNoUnit(form, checked) {
    const fields = getUnitFields(form);
    fields.forEach(field => {
      const container = findUnitContainer(field);
      if (checked) {
        field.dataset.vrOldRequired = field.required ? 'true' : 'false';
        field.dataset.vrOldValue = field.value || '';
        field.required = false;
        field.value = '';
        field.disabled = true;
        field.setAttribute('data-vr-no-unit-disabled', 'true');
        container.classList.add('vr-unit-field-disabled');

        if (!container.querySelector('.vr-unit-disabled-note')) {
          const note = document.createElement('small');
          note.className = 'vr-unit-disabled-note';
          note.textContent = 'Sem unidade vinculada: use para funcionários, síndico terceirizado ou administração.';
          container.appendChild(note);
        }
      } else {
        field.disabled = false;
        field.required = field.dataset.vrOldRequired === 'true';
        if (!field.value && field.dataset.vrOldValue) field.value = field.dataset.vrOldValue;
        field.removeAttribute('data-vr-no-unit-disabled');
        container.classList.remove('vr-unit-field-disabled');
        const note = container.querySelector('.vr-unit-disabled-note');
        if (note) note.remove();
      }
    });

    let hidden = form.querySelector('input[name="semUnidade"], input[name="noUnit"], input[name="unitless"]');
    if (!hidden) {
      hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.name = 'semUnidade';
      form.appendChild(hidden);
    }
    hidden.value = checked ? 'true' : 'false';

    let unitless = form.querySelector('input[name="unitless"]');
    if (!unitless) {
      unitless = document.createElement('input');
      unitless.type = 'hidden';
      unitless.name = 'unitless';
      form.appendChild(unitless);
    }
    unitless.value = checked ? 'true' : 'false';
  }

  function injectNoUnitOption(form) {
    if (!form || form.dataset.vrNoUnitReady === 'true') return;
    if (!isUserForm(form)) return;

    const fields = getUnitFields(form);
    if (!fields.length) return;

    form.dataset.vrNoUnitReady = 'true';

    const box = document.createElement('div');
    box.className = 'vr-no-unit-box';
    box.innerHTML = `
      <label>
        <input type="checkbox" data-vr-no-unit-toggle>
        <span>Este usuário não possui unidade vinculada</span>
      </label>
      <small>Use esta opção para administração, síndico terceirizado, portaria, zeladoria, limpeza ou qualquer funcionário que não seja morador.</small>
    `;

    const firstUnit = fields[0];
    const container = findUnitContainer(firstUnit);
    container.parentNode.insertBefore(box, container);

    const toggle = box.querySelector('[data-vr-no-unit-toggle]');
    toggle.addEventListener('change', () => applyNoUnit(form, toggle.checked));

    form.addEventListener('submit', () => {
      if (toggle.checked) {
        fields.forEach(field => {
          field.disabled = false;
          field.value = '';
          field.required = false;
        });
        const hidden = form.querySelector('input[name="semUnidade"]');
        if (hidden) hidden.value = 'true';
        const unitless = form.querySelector('input[name="unitless"]');
        if (unitless) unitless.value = 'true';
      }
    }, true);
  }

  function patchPayloadFunctions() {
    const originalFetch = window.fetch;
    if (typeof originalFetch !== 'function' || originalFetch.__vrNoUnitPatched) return;

    const patched = function(input, init) {
      try {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        const isUserEndpoint = /user|usuario|morador|funcionario|staff|employee|resident/i.test(url);
        if (isUserEndpoint && init && typeof init.body === 'string') {
          const data = JSON.parse(init.body);
          if (data.semUnidade === true || data.semUnidade === 'true' || data.unitless === true || data.unitless === 'true') {
            data.unidade = '';
            data.unit = '';
            data.apartamento = '';
            data.apartment = '';
            data.semUnidade = true;
            data.unitless = true;
            init.body = JSON.stringify(data);
          }
        }
      } catch (_) {}
      return originalFetch.apply(this, arguments);
    };

    patched.__vrNoUnitPatched = true;
    window.fetch = patched;
  }

  function scan() {
    document.querySelectorAll('form').forEach(injectNoUnitOption);
    patchPayloadFunctions();
  }

  document.addEventListener('DOMContentLoaded', scan);
  window.addEventListener('load', scan);
  const observer = new MutationObserver(scan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
