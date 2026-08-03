import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export interface ProposalPdfData {
  address: string;
  lat: number;
  lng: number;
  totalPanels: number;
  capacityKwp: number;
  annualYieldKwh: number;
  performanceRatio: number;
  netCapex: number;
  paybackYears: number | null;
  net25YearSavings: number;
}

export const generateProposalPdf = async (data: ProposalPdfData): Promise<void> => {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // Header Background Accent
  pdf.setFillColor(15, 23, 42); // slate-900
  pdf.rect(0, 0, pageWidth, 40, 'F');

  // Title & B2B Logo
  pdf.setTextColor(251, 191, 36); // amber-400
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(22);
  pdf.text('SOLARFLOW B2B SaaS', 15, 18);

  pdf.setTextColor(248, 250, 252); // slate-50
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Commercial Solar Engineering & ROI Proposal', 15, 27);

  // Proposal Metadata
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  pdf.setFontSize(9);
  pdf.setTextColor(148, 163, 184); // slate-400
  pdf.text(`Date: ${dateStr}`, pageWidth - 15, 18, { align: 'right' });
  pdf.text(`Project ID: SF-US-${Math.floor(100000 + Math.random() * 900000)}`, pageWidth - 15, 25, { align: 'right' });

  // Project Location Box
  pdf.setFillColor(241, 245, 249); // slate-100
  pdf.roundedRect(15, 48, pageWidth - 30, 20, 3, 3, 'F');

  pdf.setTextColor(15, 23, 42);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.text('Project Location Address:', 20, 56);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`${data.address} (Lat: ${data.lat.toFixed(4)}, Lon: ${data.lng.toFixed(4)})`, 20, 63);

  // Capture Map Screenshot via html2canvas
  let currentY = 75;
  const mapElement = document.getElementById('solar-map-canvas');
  if (mapElement) {
    try {
      const canvas = await html2canvas(mapElement, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#020617'
      });
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = pageWidth - 30;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 15, currentY, imgWidth, Math.min(imgHeight, 80));
      currentY += Math.min(imgHeight, 80) + 10;
    } catch (err) {
      console.warn('Could not capture map canvas screenshot:', err);
    }
  }

  // Technical Specifications Table Section
  pdf.setTextColor(15, 23, 42);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.text('System Hardware & Yield Summary', 15, currentY);
  currentY += 6;

  // Draw Table Grid
  const startX = 15;
  const colWidth = (pageWidth - 30) / 4;
  const rowHeight = 12;

  pdf.setFillColor(30, 41, 59); // slate-800
  pdf.rect(startX, currentY, pageWidth - 30, rowHeight, 'F');

  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Installed Panels', startX + 5, currentY + 7);
  pdf.text('System Capacity', startX + colWidth + 5, currentY + 7);
  pdf.text('Annual Generation', startX + colWidth * 2 + 5, currentY + 7);
  pdf.text('Performance Ratio', startX + colWidth * 3 + 5, currentY + 7);

  currentY += rowHeight;

  pdf.setFillColor(248, 250, 252);
  pdf.rect(startX, currentY, pageWidth - 30, rowHeight, 'F');

  pdf.setTextColor(15, 23, 42);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`${data.totalPanels} Modules`, startX + 5, currentY + 7);
  pdf.text(`${data.capacityKwp} kWp`, startX + colWidth + 5, currentY + 7);
  pdf.text(`${data.annualYieldKwh.toLocaleString()} kWh/yr`, startX + colWidth * 2 + 5, currentY + 7);
  pdf.text(`${(data.performanceRatio * 100).toFixed(1)}% (NREL)`, startX + colWidth * 3 + 5, currentY + 7);

  currentY += rowHeight + 15;

  // Financial ROI Table
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.text('25-Year Financial & Environmental Return', 15, currentY);
  currentY += 6;

  pdf.setFillColor(241, 245, 249);
  pdf.roundedRect(15, currentY, pageWidth - 30, 35, 3, 3, 'F');

  pdf.setFontSize(10);
  pdf.setTextColor(51, 65, 85);
  pdf.text(`Estimated Net Capital Investment (After 30% Federal ITC):`, 20, currentY + 10);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`$${data.netCapex.toLocaleString()}`, pageWidth - 20, currentY + 10, { align: 'right' });

  pdf.setFont('helvetica', 'normal');
  pdf.text(`Projected Simple Payback Period:`, 20, currentY + 18);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(16, 185, 129); // emerald-500
  pdf.text(data.paybackYears ? `${data.paybackYears} Years` : '> 25 Years', pageWidth - 20, currentY + 18, { align: 'right' });

  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(51, 65, 85);
  pdf.text(`25-Year Net Cumulative Savings:`, 20, currentY + 26);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(245, 158, 11); // amber-500
  pdf.text(`$${data.net25YearSavings.toLocaleString()}`, pageWidth - 20, currentY + 26, { align: 'right' });

  // Footer Disclaimer
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'italic');
  pdf.setTextColor(148, 163, 184);
  pdf.text(
    'Generated by SolarFlow Automated Engineering Platform. Estimates based on NREL PVWatts standards and Google Solar API data.',
    pageWidth / 2,
    pageHeight - 12,
    { align: 'center' }
  );

  // Save PDF file
  const fileName = `Solar_Proposal_${data.address.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
  pdf.save(fileName);
};
