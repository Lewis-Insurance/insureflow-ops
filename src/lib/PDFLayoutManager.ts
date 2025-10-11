import jsPDF from 'jspdf';

export class PDFLayoutManager {
  private doc: jsPDF;
  private yPosition: number;
  private readonly PAGE_HEIGHT = 297; // A4 height in mm
  private readonly MARGIN_BOTTOM = 25;
  private readonly LINE_HEIGHT = 6;
  
  constructor(doc: jsPDF, startY: number = 20) {
    this.doc = doc;
    this.yPosition = startY;
  }
  
  checkPageBreak(requiredSpace: number = 20): void {
    if (this.yPosition + requiredSpace > this.PAGE_HEIGHT - this.MARGIN_BOTTOM) {
      this.doc.addPage();
      this.yPosition = 20;
    }
  }
  
  addText(
    text: string, 
    x: number, 
    fontSize: number = 10, 
    style: 'normal' | 'bold' = 'normal',
    align?: 'left' | 'center' | 'right'
  ): void {
    this.checkPageBreak();
    this.doc.setFontSize(fontSize);
    this.doc.setFont(undefined, style);
    
    if (align) {
      this.doc.text(text, x, this.yPosition, { align });
    } else {
      this.doc.text(text, x, this.yPosition);
    }
  }
  
  addMultilineText(
    text: string,
    x: number,
    maxWidth: number,
    fontSize: number = 10,
    style: 'normal' | 'bold' = 'normal'
  ): void {
    this.doc.setFontSize(fontSize);
    this.doc.setFont(undefined, style);
    const lines = this.doc.splitTextToSize(text, maxWidth);
    
    lines.forEach((line: string) => {
      this.checkPageBreak();
      this.doc.text(line, x, this.yPosition);
      this.moveDown();
    });
  }
  
  addLine(x1: number = 20, x2: number = 190): void {
    this.checkPageBreak();
    this.doc.line(x1, this.yPosition, x2, this.yPosition);
  }
  
  moveDown(distance: number = this.LINE_HEIGHT): void {
    this.yPosition += distance;
  }
  
  setY(y: number): void {
    this.yPosition = y;
  }
  
  getY(): number {
    return this.yPosition;
  }
  
  getDoc(): jsPDF {
    return this.doc;
  }
}
