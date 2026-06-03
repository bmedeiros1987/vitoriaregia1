import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CrewRoster } from './pdfParser';
import type { ComplianceResult, GymRecommendation } from './complianceEngine';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export function exportReport(
  roster: CrewRoster,
  compliance: ComplianceResult,
  gymRecommendations: GymRecommendation[]
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Derive irregularities and warnings from alerts
  const irregularities = compliance.alerts.filter(a => a.severity === 'error');
  const warnings = compliance.alerts.filter(a => a.severity === 'warning');
  
  // ============================================================
  // HEADER
  // ============================================================
  doc.setFillColor(27, 42, 74); // #1B2A4A
  doc.rect(0, 0, pageWidth, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('CrewCheck', 14, 18);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Relatorio de Conformidade de Escala', 14, 26);
  doc.text('RBAC 117 - Lei 13.475/2017 - ACT aplicavel', 14, 33);
  
  // Date on right
  doc.setFontSize(9);
  const dateStr = `Gerado em ${new Date().toLocaleDateString('pt-BR')}`;
  doc.text(dateStr, pageWidth - 14, 33, { align: 'right' });
  
  // ============================================================
  // CREW INFO
  // ============================================================
  let y = 50;
  doc.setTextColor(27, 42, 74);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`${MONTHS[roster.month - 1]} ${roster.year}`, 14, y);
  
  y += 8;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`${roster.crewName} - ${roster.rank} - Base ${roster.base}`, 14, y);
  y += 7;
  doc.setFontSize(9);
  doc.text(`ACT: ${compliance.legalProfile.actName} | Funcao: ${compliance.legalProfile.roleLabel} / ${compliance.legalProfile.functionLabel}`, 14, y);
  y += 5;
  doc.text(`Limite voo: ${compliance.legalProfile.flightLimit28Days}h/28d e ${compliance.legalProfile.flightLimit365Days}h/365d | Equipamento: ${compliance.legalProfile.aircraftGroupLabel}`, 14, y);
  
  // ============================================================
  // SCORE SUMMARY
  // ============================================================
  y += 12;
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(14, y, pageWidth - 28, 20, 3, 3, 'F');
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(27, 42, 74);
  
  const scoreX = 30;
  const irregX = 80;
  const alertX = 130;
  
  doc.text(`Score: ${compliance.score}`, scoreX, y + 13);
  
  const irregColor = irregularities.length > 0 ? [211, 47, 47] : [46, 125, 50];
  doc.setTextColor(irregColor[0], irregColor[1], irregColor[2]);
  doc.text(`Irregularidades: ${irregularities.length}`, irregX, y + 13);
  
  const alertColor = warnings.length > 0 ? [245, 124, 0] : [46, 125, 50];
  doc.setTextColor(alertColor[0], alertColor[1], alertColor[2]);
  doc.text(`Alertas: ${warnings.length}`, alertX, y + 13);
  
  // ============================================================
  // IRREGULARITIES
  // ============================================================
  y += 30;
  if (irregularities.length > 0) {
    doc.setTextColor(211, 47, 47);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(`IRREGULARIDADES (${irregularities.length})`, 14, y);
    y += 4;
    
    const irregData = irregularities.map(item => [
      item.title,
      item.description,
      item.legalReference || '-'
    ]);
    
    autoTable(doc, {
      startY: y,
      head: [['Problema', 'Descricao', 'Base Legal']],
      body: irregData,
      theme: 'striped',
      headStyles: { fillColor: [211, 47, 47], fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 45, fontStyle: 'bold' },
        1: { cellWidth: 80 },
        2: { cellWidth: 45 }
      },
      margin: { left: 14, right: 14 }
    });
    
    y = (doc as any).lastAutoTable.finalY + 10;
  }
  
  // ============================================================
  // WARNINGS
  // ============================================================
  if (warnings.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }
    
    doc.setTextColor(245, 124, 0);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(`PONTOS DE ATENCAO (${warnings.length})`, 14, y);
    y += 4;
    
    const warnData = warnings.map(item => [
      item.title,
      item.description,
      item.legalReference || '-'
    ]);
    
    autoTable(doc, {
      startY: y,
      head: [['Ponto', 'Descricao', 'Base Legal']],
      body: warnData,
      theme: 'striped',
      headStyles: { fillColor: [245, 124, 0], fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 45, fontStyle: 'bold' },
        1: { cellWidth: 80 },
        2: { cellWidth: 45 }
      },
      margin: { left: 14, right: 14 }
    });
    
    y = (doc as any).lastAutoTable.finalY + 10;
  }
  
  // If no irregularities and no warnings
  if (irregularities.length === 0 && warnings.length === 0) {
    doc.setTextColor(46, 125, 50);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('ESCALA CONFORME - Nenhuma irregularidade encontrada.', 14, y);
    y += 15;
  }
  
  // ============================================================
  // METRICS
  // ============================================================
  if (y > 220) { doc.addPage(); y = 20; }
  
  doc.setTextColor(27, 42, 74);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('METRICAS', 14, y);
  y += 4;
  
  const metricsData = [
    ['Horas de Voo', `${compliance.metrics.totalFlightHours.toFixed(0)}h`, `${compliance.legalProfile.flightLimit28Days}h/28d`, compliance.legalProfile.actName],
    ['Horas de Trabalho', `${compliance.metrics.totalDutyHours.toFixed(0)}h`, '176h (max)', 'Art. 41 - Lei 13.475'],
    ['Folgas no Mes', `${compliance.metrics.totalDaysOff} dias`, `${compliance.metrics.minDaysOffRequired} parametro / 9 atencao`, compliance.legalProfile.actName],
    ['Sobreavisos', `${compliance.metrics.totalStandby}`, `${compliance.metrics.maxStandbyMonth} max`, compliance.legalProfile.actName],
    ['Operacoes na Madrugada', `${compliance.metrics.nightOperations}`, `${compliance.metrics.maxNightOps168h} por 168h`, compliance.legalProfile.actName],
    ['Folgas em Fim de Semana', `${compliance.metrics.weekendPairs} dia(s)`, '2 (min)', 'Art. 51 - Lei 13.475'],
  ];
  
  autoTable(doc, {
    startY: y,
    head: [['Metrica', 'Valor', 'Limite', 'Base Legal']],
    body: metricsData,
    theme: 'striped',
    headStyles: { fillColor: [27, 42, 74], fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    margin: { left: 14, right: 14 }
  });
  
  y = (doc as any).lastAutoTable.finalY + 10;
  
  // ============================================================
  // TIMELINE
  // ============================================================
  doc.addPage();
  y = 20;
  
  doc.setTextColor(27, 42, 74);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('TIMELINE DA ESCALA', 14, y);
  y += 4;
  
  const timelineData = roster.days.map(day => {
    let details = '';
    if (day.type === 'VOO' && day.legs && day.legs.length > 0) {
      details = day.legs.map(l => `${l.origin}-${l.destination}`).join(', ');
    } else if (['HSB', 'HSBE'].includes(day.type)) {
      details = `Sobreaviso ${day.dutyReport || ''} - ${day.dutyDebrief || ''}`;
    } else if (['ASB'].includes(day.type)) {
      details = `Reserva aeroportuária ${day.dutyReport || ''} - ${day.dutyDebrief || ''}`;
    } else if (day.type === 'LAYOVER') {
      details = `Inativo/pernoite ${day.hotel || ''}`.trim();
    } else if (day.type === 'OFF') {
      details = 'Extensão de descanso/repouso';
    }
    return [
      day.date,
      day.dayOfWeek,
      day.type,
      day.dutyReport || '-',
      day.dutyDebrief || '-',
      day.dutyHours ? `${day.dutyHours.toFixed(1)}h` : '-',
      details
    ];
  });
  
  autoTable(doc, {
    startY: y,
    head: [['Data', 'Dia', 'Tipo', 'Inicio', 'Fim', 'Jornada', 'Detalhes']],
    body: timelineData,
    theme: 'striped',
    headStyles: { fillColor: [27, 42, 74], fontSize: 8 },
    bodyStyles: { fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 12 },
      2: { cellWidth: 15 },
      3: { cellWidth: 15 },
      4: { cellWidth: 15 },
      5: { cellWidth: 17 },
      6: { cellWidth: 'auto' }
    },
    margin: { left: 14, right: 14 }
  });
  
  // ============================================================
  // GYM RECOMMENDATIONS
  // ============================================================
  doc.addPage();
  y = 20;
  
  doc.setTextColor(27, 42, 74);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('PLANEJAMENTO DE ACADEMIA', 14, y);
  y += 4;
  
  const gymData = gymRecommendations.map(rec => {
    const status = rec.availability === 'ideal' ? 'IDEAL' : 
                   rec.availability === 'good' ? 'BOM' : 
                   rec.availability === 'moderate' ? 'MODERADO' : 'LIMITADO';
    return [
      rec.date,
      rec.dayType,
      status,
      rec.suggestedTime || `${rec.startTime}-${rec.endTime}`,
      rec.suggestedDuration,
      rec.reason
    ];
  });
  
  autoTable(doc, {
    startY: y,
    head: [['Data', 'Dia', 'Status', 'Horario', 'Duracao', 'Observacao']],
    body: gymData,
    theme: 'striped',
    headStyles: { fillColor: [27, 42, 74], fontSize: 8 },
    bodyStyles: { fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 12 },
      2: { cellWidth: 20 },
      3: { cellWidth: 28 },
      4: { cellWidth: 18 },
      5: { cellWidth: 'auto' }
    },
    margin: { left: 14, right: 14 },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 2) {
        const cellText = data.cell.raw as string;
        if (cellText.includes('IDEAL') || cellText.includes('BOM')) {
          data.cell.styles.textColor = [46, 125, 50];
          data.cell.styles.fontStyle = 'bold';
        } else if (cellText.includes('MODERADO')) {
          data.cell.styles.textColor = [245, 124, 0];
          data.cell.styles.fontStyle = 'bold';
        } else {
          data.cell.styles.textColor = [211, 47, 47];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    }
  });
  
  // ============================================================
  // FOOTER on all pages
  // ============================================================
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `CrewCheck - Analise de Conformidade - Pagina ${i}/${totalPages}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'center' }
    );
  }
  
  // Save
  const fileName = `CrewCheck_${MONTHS[roster.month - 1]}_${roster.year}_${roster.crewName.split(' ')[0]}.pdf`;
  doc.save(fileName);
}
