import type { DashboardData } from './jira/types';

export type ReportTable = { title: string; columns: string[]; rows: string[][] };
export type ReportChart = { title:string; labels:string[]; series:{name:string;values:number[]}[] };
export type Report = { title: string; tables: ReportTable[]; charts: ReportChart[] };
const humanize = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
// Keep numeric zero and unavailable values distinct in every output.
const cell = (value: unknown): string => value == null ? 'N/A' : Array.isArray(value) ? value.map(cell).join(', ') : String(value);
export function tablesFrom(title: string, value: unknown): ReportTable[] {
  if (Array.isArray(value)) {
    if (!value.length) return [{title, columns:['Result'], rows:[['No matching data']]}];
    if (typeof value[0] !== 'object') return [{title, columns:[title], rows:value.map(v => [cell(v)])}];
    const keys = [...new Set(value.flatMap(v => Object.keys(v || {})))].filter(k => value.some(v => v?.[k] != null && typeof v[k] !== 'object'));
    return keys.length ? [{title, columns:keys.map(humanize), rows:value.map(v => keys.map(k => cell(v[k])))}] : [];
  }
  if (!value || typeof value !== 'object') return [];
  const entries = Object.entries(value);
  const scalar = entries.filter(([,v]) => v == null || typeof v !== 'object');
  return [...(scalar.length ? [{title,columns:['Metric','Value'],rows:scalar.map(([k,v]) => [humanize(k),cell(v)])}] : []), ...entries.filter(([,v]) => v && typeof v === 'object').flatMap(([k,v]) => tablesFrom(`${title} / ${humanize(k)}`,v))];
}
export function buildReport(id: string, title: string, data: DashboardData): Report {
  const charts:ReportChart[] = id==='executive'||id==='pod' ? [
    {title:'Sprint delivery overview',labels:data.delivery.labels,series:[{name:'Committed SP',values:data.delivery.committed},{name:'Delivered SP',values:data.delivery.done},{name:'Carryover SP',values:data.delivery.carried}]},
    {title:'Velocity trajectory',labels:data.trends.velocityTrend.labels,series:[{name:'Velocity SP',values:data.trends.velocityTrend.velocity},{name:'Moving average',values:data.trends.velocityTrend.movingAvg}]},
    {title:'Cumulative throughput',labels:data.trends.cumulativeThroughput.labels,series:[{name:'Completed items',values:data.trends.cumulativeThroughput.completedIssues}]},
    {title:'Features completed',labels:data.trends.featureCompletion.labels,series:[{name:'Completed features',values:data.trends.featureCompletion.completedFeatures}]},
  ]:id==='quality'?[{title:'Defects by priority',labels:data.quality.priorityDistribution.map(item=>item.priority),series:[{name:'Defects',values:data.quality.priorityDistribution.map(item=>item.count)}]}]:[];
  const sources: Record<string, unknown> = {
    executive: {summary:data.summary, metrics:data.metrics.map(metric=>({metric:metric.title,value:metric.value,description:metric.subtitle}))},
    pod: {summary:data.summary, workItems:data.issueList},
    developer: {contributors:data.developers.map(person=>({contributor:person.name,team:person.team,assignedStories:person.assignedStories,assignedSubtasks:person.assignedSubtasks,completedStories:person.completedStories,completedSubtasks:person.completedSubtasks,loggedEffortHours:person.loggedHours,originalEstimatesHours:person.originalEstimateHours,workCompletionPercent:person.completionRate,utilizationPercent:person.utilizationPct})), workItems:data.developerIssueList},
    quality: {quality:data.quality, qaCapacity:data.qaCapacity, zephyr:data.zephyr},
    diagnosis: data.diagnosis.individualContribution?.people.map(person=>({contributor:person.name,assignedTasks:person.subtaskCount,originalEstimatesHours:person.originalEstimateHours,loggedEffortHours:person.loggedEffortHours,attributedStoryPoints:person.attributedStoryPoints,hoursPerStoryPoint:person.efficiency&&person.efficiency>0?1/person.efficiency:null})),
    issues: data.issueList,
  };
  return {title,charts,tables:[...tablesFrom(title,sources[id]),...charts.map(chart=>({title:chart.title,columns:['Sprint',...chart.series.map(s=>s.name)],rows:chart.labels.map((name,index)=>[name,...chart.series.map(s=>String(s.values[index]??0))])}))]};
}
function chartImage(chart:ReportChart):string {
  const canvas=document.createElement('canvas');canvas.width=1400;canvas.height=550;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Chart rendering is unavailable in this browser.');
  ctx.fillStyle='#FFFFFF';ctx.fillRect(0,0,1400,550);ctx.font='bold 24px Arial';ctx.fillStyle='#17365D';ctx.fillText(chart.title,30,38);
  const colors=['#2563EB','#10B981','#F59E0B'];const max=Math.max(1,...chart.series.flatMap(s=>s.values));
  chart.series.forEach((s,si)=>{ctx.fillStyle=colors[si%3];ctx.fillRect(30+si*290,60,16,16);ctx.font='18px Arial';ctx.fillText(s.name,54+si*290,75);});
  const width=1250/Math.max(1,chart.labels.length);
  chart.labels.forEach((name,i)=>{chart.series.forEach((s,si)=>{const h=(s.values[i]||0)/max*330;ctx.fillStyle=colors[si%3];const x=90+i*width+si*width*.75/chart.series.length;ctx.fillRect(x,440-h,width*.7/chart.series.length,h);ctx.font='16px Arial';ctx.fillText(String(Math.round((s.values[i]||0)*10)/10),x,432-h);});ctx.save();ctx.translate(95+i*width,465);ctx.rotate(-.2);ctx.fillStyle='#475569';ctx.font='16px Arial';ctx.fillText(name.slice(0,35),0,0);ctx.restore();});
  return canvas.toDataURL('image/png');
}
export async function exportReports(format:string,reports:Report[],scope:string) {
  const generated = new Date().toLocaleString();
  const filename = `Delivery-report-${new Date().toISOString().slice(0,10)}`;
  if(format === 'xlsx') {
    const {default:ExcelJS} = await import('exceljs'); const book = new ExcelJS.Workbook();
    book.creator='Delivery Dashboard'; book.created=new Date();
    for(const report of reports) {
      const sheet=book.addWorksheet(report.title.slice(0,31));
      sheet.addRow([report.title]); sheet.addRow([scope]); sheet.addRow([`Generated ${generated}`]);
      const columnCount=Math.max(2,...report.tables.map(table=>table.columns.length));
      for(let row=1;row<=3;row++)sheet.mergeCells(row,1,row,columnCount);
      sheet.getRow(1).height=32;sheet.getRow(2).height=44;sheet.getRow(3).height=22;
      sheet.getRow(1).font={bold:true,size:20,color:{argb:'FF17365D'}};
      for(const table of report.tables) {
        sheet.addRow([]); sheet.addRow([table.title]).font={bold:true,size:12};
        const header=sheet.addRow(table.columns);
        header.eachCell(c=>{c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF17365D'}};});
        table.rows.forEach((row,index)=>{const added=sheet.addRow(row.map(value=>/^-?(0|[1-9]\d*)(\.\d+)?$/.test(value)?Number(value):value));added.height=Math.max(24,...row.map(value=>Math.ceil(value.length/24)*15+8));if(index%2===0)added.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF1F5F9'}};});});
      }
      sheet.columns.forEach(c=>{c.width=26;c.alignment={wrapText:true,vertical:'top'};});
      sheet.views=[{state:'frozen',ySplit:3}]; sheet.pageSetup={orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0};
    }
    const buffer=await book.xlsx.writeBuffer(); download(new Blob([buffer]),`${filename}.xlsx`);return;
  }
  if(format==='pdf') {
    const {jsPDF}=await import('jspdf');const {default:autoTable}=await import('jspdf-autotable');
    const pdf=new jsPDF({orientation:'landscape'});
    for(const [index,report] of reports.entries()) {
      if(index)pdf.addPage();pdf.setTextColor('#17365D');pdf.setFontSize(24);pdf.text(report.title,14,22);
      pdf.setFontSize(9);pdf.text(pdf.splitTextToSize(`${scope}\nGenerated ${generated}`,265),14,32);let y=52;
      for(const chart of report.charts){if(y>52){pdf.addPage();y=20;}pdf.addImage(chartImage(chart),'PNG',14,y,265,104);pdf.addPage();y=20;}
      for(const table of report.tables) {
        if(y>165){pdf.addPage();y=20;}pdf.setFontSize(12);pdf.text(table.title,14,y);
        autoTable(pdf,{head:[table.columns],body:table.rows,startY:y+5,styles:{fontSize:8,cellPadding:3,overflow:'linebreak'},headStyles:{fillColor:[23,54,93]},alternateRowStyles:{fillColor:[241,245,249]},margin:{bottom:16},horizontalPageBreak:true,horizontalPageBreakRepeat:0});
        y=(pdf as unknown as {lastAutoTable:{finalY:number}}).lastAutoTable.finalY+14;
      }
    }
    for(let page=1;page<=pdf.getNumberOfPages();page++){pdf.setPage(page);pdf.setFontSize(8);pdf.text(`Delivery Dashboard | ${page} / ${pdf.getNumberOfPages()}`,14,202);}pdf.save(`${filename}.pdf`);return;
  }
  const {default:PptxGenJS}=await import('pptxgenjs');const ppt=new PptxGenJS();ppt.layout='LAYOUT_WIDE';ppt.author='Delivery Dashboard';
  for(const report of reports) {
    for(const chart of report.charts){const slide=ppt.addSlide();slide.addText(report.title,{x:.5,y:.3,w:12,h:.5,fontSize:24,bold:true,color:'17365D'});slide.addText(scope,{x:.5,y:.9,w:12,h:.5,fontSize:10,color:'475569'});slide.addImage({data:chartImage(chart),x:.5,y:1.6,w:12.3,h:4.84});}
    for(const table of report.tables) {
    // Wide data tables are split into column groups as well as row groups.
    for(let column=0;column<table.columns.length;column+=6)for(let row=0;row<Math.max(1,table.rows.length);row+=8) {
      const slide=ppt.addSlide();slide.background={color:'F8FAFC'};
      slide.addText(report.title,{x:.5,y:.3,w:12.3,h:.5,fontSize:24,bold:true,color:'17365D'});
      slide.addText(scope,{x:.5,y:.9,w:12.3,h:.6,fontSize:10,color:'475569'});
      slide.addText(table.title,{x:.5,y:1.6,w:12.3,h:.5,fontSize:16,bold:true,color:'17365D'});
      // Rows and columns are already paginated above. PptxGenJS autoPage can
      // recursively add an empty continuation table for wrapped content.
      slide.addTable([table.columns.slice(column,column+6).map(text=>({text,options:{bold:true,color:'FFFFFF',fill:{color:'17365D'}}})),...table.rows.slice(row,row+8).map(r=>r.slice(column,column+6).map(text=>({text})))],{x:.5,y:2.2,w:12.3,fontSize:10,border:{pt:.5,color:'CBD5E1'},fill:{color:'FFFFFF'},color:'334155',margin:5,autoPage:false});
      slide.addText(`Generated ${generated}`,{x:.5,y:7,w:12,h:.2,fontSize:8,color:'64748B'});
    }
  }
  }
  await ppt.writeFile({fileName:`${filename}.pptx`});
}
function download(blob:Blob,name:string){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
