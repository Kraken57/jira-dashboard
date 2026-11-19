"use client";

import {useState} from 'react';
import {DetailModal} from './DetailModal';
import type {DashboardData, JiraWorkItem} from '@/lib/jira/types';

export function ReportExport({tabs,activeTab,scope,getData,getAuditResults}: {
  tabs:{id:string;label:string}[];activeTab:string;scope:string;getData:(tab:string)=>DashboardData;
  getAuditResults:()=>{title:string;explanation:string;issues:JiraWorkItem[]}[];
}) {
  const [open,setOpen]=useState(false);
  const [selected,setSelected]=useState<string[]>([activeTab]);
  const [format,setFormat]=useState('pdf');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function generate(){
    setBusy(true);setError('');
    try{
      const {buildReport,exportReports}=await import('@/lib/reportExport');
      const reports=tabs.filter(t=>selected.includes(t.id)).map(t=>{
        const report=buildReport(t.id,t.label,getData(t.id));
        if(t.id==='issues') report.tables=getAuditResults().map(card=>({title:`${card.title} (${card.issues.length})`,columns:['Key','Summary','Status','Pod','PI','Due date','Fix versions'],rows:card.issues.length?card.issues.map(item=>[item.key,item.summary,item.status,item.podName,item.quarter,item.dueDate||'Not set',item.fixVersions?.join(', ')||'Not set']):[['No matching issues','','','','','','']]}));
        return report;
      });
      await exportReports(format,reports,scope);
    }catch(reason){setError(reason instanceof Error?reason.message:'The report could not be generated. Please try again.');}
    finally{setBusy(false);}
  }
  return <>
    <div className="flex justify-end"><button className="rounded-lg bg-jira-blue px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90" onClick={()=>{setSelected([activeTab]);setError('');setOpen(true);}}>Download report</button></div>
    {open&&<DetailModal title="Download report" subtitle="Choose the sections and file format for your report" onClose={()=>{if(!busy)setOpen(false);}}>
      <div className="space-y-5 p-5">
        <div className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600"><strong>Report scope</strong><p className="mt-1">{scope}</p></div>
        <fieldset disabled={busy} className="space-y-3"><legend className="mb-3 text-sm font-semibold">Report sections</legend>
          <button type="button" className="text-xs font-semibold text-jira-blue" onClick={()=>setSelected(selected.length===tabs.length?[]:tabs.map(t=>t.id))}>{selected.length===tabs.length?'Clear selection':'Select all sections'}</button>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{tabs.map(tab=><label key={tab.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm ${selected.includes(tab.id)?'border-blue-300 bg-blue-50':'border-slate-200'}`}><input type="checkbox" checked={selected.includes(tab.id)} onChange={()=>setSelected(previous=>previous.includes(tab.id)?previous.filter(id=>id!==tab.id):[...previous,tab.id])}/>{tab.label}</label>)}</div>
        </fieldset>
        <fieldset disabled={busy}><legend className="mb-3 text-sm font-semibold">File format</legend><div className="grid grid-cols-3 gap-2">{[['pdf','PDF report'],['pptx','PowerPoint'],['xlsx','Excel workbook']].map(([id,label])=><button type="button" key={id} onClick={()=>setFormat(id)} aria-pressed={format===id} className={`rounded-lg border p-3 text-xs font-semibold ${format===id?'border-blue-400 bg-blue-50 text-blue-800':'border-slate-200'}`}>{label}</button>)}</div></fieldset>
        <p className="text-xs text-slate-500">The report uses the loaded dashboard data and shared pod, quarter, sprint, and sprint status selections. Excel includes one worksheet per selected section.</p>
        {error&&<p role="alert" className="rounded bg-red-50 p-3 text-xs text-red-700">{error}</p>}
        <button disabled={busy||!selected.length} onClick={generate} className="w-full rounded-lg bg-jira-blue px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy?'Preparing report…':`Download ${format.toUpperCase()}`}</button>
      </div>
    </DetailModal>}
  </>;
}
