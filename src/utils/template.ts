import * as XLSX from 'xlsx';

export const downloadExcelTemplate = () => {
  const data = [
    {
      '編號': '1',
      '工號': 'CEO001',
      '姓名': '張大明',
      '職稱': '執行長',
      '部門': '總經理室',
      '部門代號': 'HQ001',
      '上級編號': '',
      '子分頁': '是',
      '主管標籤': '是',
      '是否為特助': '否',
      '是否為經營階層': '是',
      '代理人編號': '',
      '照片': ''
    },
    {
      '編號': '2',
      '工號': 'HR001',
      '姓名': '李小華',
      '職稱': '人事經理',
      '部門': '人事部',
      '部門代號': 'HR001',
      '上級編號': '1',
      '子分頁': '是',
      '主管標籤': '否',
      '是否為特助': '否',
      '是否為經營階層': '否',
      '代理人編號': '',
      '照片': ''
    },
    {
      '編號': '3',
      '工號': 'HR002',
      '姓名': '王小明',
      '職稱': '人事專員',
      '部門': '人事部',
      '部門代號': 'HR001',
      '上級編號': '2',
      '子分頁': '否',
      '主管標籤': '否',
      '是否為特助': '否',
      '是否為經營階層': '否',
      '代理人編號': '',
      '照片': ''
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '員工名單');

  const deptData = [
    { '部門名稱': '總經理室', '部門代號': 'HQ001' },
    { '部門名稱': '人事部', '部門代號': 'HR001' },
    { '部門名稱': '研發部', '部門代號': 'RD001' }
  ];
  const deptWorksheet = XLSX.utils.json_to_sheet(deptData);
  XLSX.utils.book_append_sheet(workbook, deptWorksheet, '部門對照表');

  const titleData = [
    { '職稱名稱': '執行長' },
    { '職稱名稱': '人事經理' },
    { '職稱名稱': '人事專員' },
    { '職稱名稱': '研發經理' },
    { '職稱名稱': '研發工程師' }
  ];
  const titleWorksheet = XLSX.utils.json_to_sheet(titleData);
  XLSX.utils.book_append_sheet(workbook, titleWorksheet, '職稱清單');

  // Generate buffer
  XLSX.writeFile(workbook, 'OrgChart_Template.xlsx');
};
