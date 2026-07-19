const GENERIC_CONFIRMATION_ERROR = 'Não foi possível concluir o cadastro. A confirmação foi mantida aberta para você revisar os dados e tentar novamente.';

function messageFrom(error) {
  return String(error?.message || error || 'Não foi possível cadastrar a encomenda. Tente novamente.');
}

export function operationFailure(error) {
  return { ok:false, error:messageFrom(error) };
}

export function isOperationFailure(result) {
  return result === false || Boolean(result && typeof result === 'object' && result.ok === false);
}

export function confirmationStateAfterResult(current, result) {
  if (!isOperationFailure(result)) return null;
  return {
    ...current,
    running:false,
    error:typeof result === 'object' && result?.error ? String(result.error) : GENERIC_CONFIRMATION_ERROR
  };
}

export function normalizeCreatedPackage(response) {
  const nested = response?.package && typeof response.package === 'object' ? response.package : null;
  const source = nested || response;
  if (!source || typeof source !== 'object' || source.id === undefined || source.id === null) {
    throw new Error('O servidor não confirmou o número da encomenda. Atualize a lista antes de tentar novamente.');
  }
  const resident = source.resident || response?.resident || null;
  return {
    ...source,
    resident,
    linked:response?.linked ?? source.linked ?? Boolean(resident),
    notification_status:response?.notification_status || source.notification_status || (resident ? 'enviando' : 'sem_vinculo'),
    resident_name:source.resident_name || resident?.name || '',
    resident_email:source.resident_email || resident?.email || ''
  };
}

export function prependPackage(rows, created) {
  const current = Array.isArray(rows) ? rows : [];
  return [created, ...current.filter(item => String(item?.id) !== String(created?.id))];
}

export async function submitPackageRegistration({
  payload,
  postPackage,
  onCreated,
  resetForm,
  refresh,
  notify,
  successMessage
}) {
  let created;
  try {
    created = normalizeCreatedPackage(await postPackage(payload));
  } catch (error) {
    const failure = operationFailure(error);
    notify?.(failure.error, true);
    return failure;
  }

  try { onCreated?.(created); } catch {}
  try { resetForm?.(); } catch {}

  const fallbackMessage = created.linked === false
    ? `Encomenda ${created.tracking || created.id} cadastrada. O registro foi salvo sem vínculo automático com morador.`
    : `Encomenda ${created.tracking || created.id} cadastrada. As notificações estão sendo enviadas em segundo plano.`;
  notify?.(typeof successMessage === 'function' ? successMessage(created) : (successMessage || fallbackMessage));

  if (typeof refresh === 'function') {
    void Promise.resolve().then(() => refresh()).catch(() => null);
  }
  return created;
}
