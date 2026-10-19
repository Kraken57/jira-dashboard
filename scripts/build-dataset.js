import fs from 'fs';
import path from 'path';

const csvDir = 'c:/MYPROJECTS/CDK/data/jira_five_project_csvs_preparation';
const files = fs.readdirSync(csvDir).filter(f => f.endsWith('.csv'));

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current);
  return result;
}

const allItems = [];

files.forEach(file => {
  const content = fs.readFileSync(path.join(csvDir, file), 'utf8');
  const lines = content.split('\n').filter(l => l.trim().length > 0);
  const header = parseCSVLine(lines[0]);

  const idx = {
    spaceName: header.indexOf('Space Name'),
    spaceKey: header.indexOf('Space Key'),
    workType: header.indexOf('Work Type'),
    key: header.indexOf('Source Issue Key'),
    summary: header.indexOf('Summary'),
    status: header.indexOf('Status'),
    priority: header.indexOf('Priority'),
    assignee: header.indexOf('Assignee'),
    pi: header.indexOf('Program Increment'),
    sprint: header.indexOf('Sprint'),
    created: header.indexOf('Created Date'),
    resolutionDate: header.indexOf('Resolution Date'),
    sp: header.indexOf('Story Points'),
    team: header.indexOf('Team')
  };

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (!cols[idx.key] && !cols[idx.summary]) continue;

    let sp = parseFloat(cols[idx.sp]);
    if (isNaN(sp)) sp = 0;

    let sprints = [];
    if (cols[idx.sprint]) {
      sprints = cols[idx.sprint].split(',').map(s => s.trim()).filter(Boolean);
    }

    allItems.push({
      key: cols[idx.key] || '',
      summary: cols[idx.summary] || '',
      podKey: cols[idx.spaceKey] || '',
      podName: cols[idx.spaceName] || '',
      workType: cols[idx.workType] || 'Story',
      status: cols[idx.status] || 'To Do',
      priority: cols[idx.priority] || 'Medium',
      assignee: cols[idx.assignee] || 'Unassigned',
      quarter: cols[idx.pi] || 'CY26 PI.1',
      sprints,
      storyPoints: sp,
      team: cols[idx.team] || '',
      resolutionDate: cols[idx.resolutionDate] || '',
      createdDate: cols[idx.created] || ''
    });
  }
});

fs.writeFileSync('src/lib/jira/enterpriseData.json', JSON.stringify(allItems, null, 2), 'utf8');
console.log('Successfully generated enterpriseData.json with', allItems.length, 'items');

