import type { CrewRoster } from './pdfParser';
import type { ComplianceResult, GymRecommendation } from './complianceEngine';

/**
 * Generate a summary message for sharing
 */
export function generateShareMessage(
  roster: CrewRoster,
  compliance: ComplianceResult
): string {
  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const statusText = 
    compliance.overallStatus === 'violation'
      ? '🚨 IRREGULARIDADES ENCONTRADAS'
      : compliance.overallStatus === 'warning'
      ? '⚠️ ATENÇÃO - Pontos de Atenção'
      : '✅ CONFORME com a legislação';

  const errors = compliance.alerts.filter(a => a.severity === 'error').length;
  const warnings = compliance.alerts.filter(a => a.severity === 'warning').length;

  // Calculate flight hours and count from roster days
  const totalFlightHours = roster.days.reduce((sum, day) => sum + (day.flyingHours || 0), 0);
  const flightCount = roster.days.filter(d => d.type === 'VOO').length;

  const message = `
*CrewCheck - Análise de Escala*

📅 ${monthNames[roster.month - 1]} ${roster.year}
👤 ${roster.crewName} (${roster.rank})
✈️ Base ${roster.base}

${statusText}

📊 Resumo:
• Horas de voo: ${totalFlightHours.toFixed(1)}h
• Voos: ${flightCount}
• Irregularidades: ${errors}
• Pontos de atenção: ${warnings}

Analisado com CrewCheck
Conformidade: RBAC 117 · Lei 13.475/2017
`.trim();

  return message;
}

/**
 * Share to WhatsApp
 */
export function shareToWhatsApp(roster: CrewRoster, compliance: ComplianceResult) {
  const message = generateShareMessage(roster, compliance);
  const encoded = encodeURIComponent(message);
  const url = `https://wa.me/?text=${encoded}`;
  window.open(url, '_blank');
}

/**
 * Share to Telegram
 */
export function shareToTelegram(roster: CrewRoster, compliance: ComplianceResult) {
  const message = generateShareMessage(roster, compliance);
  const encoded = encodeURIComponent(message);
  // Telegram share uses text parameter for the message content
  const url = `https://t.me/share/url?text=${encoded}`;
  window.open(url, '_blank');
}

/**
 * Copy to clipboard
 */
export async function copyToClipboard(roster: CrewRoster, compliance: ComplianceResult) {
  const message = generateShareMessage(roster, compliance);
  try {
    await navigator.clipboard.writeText(message);
    return true;
  } catch (error) {
    console.error('Error copying to clipboard:', error);
    return false;
  }
}
