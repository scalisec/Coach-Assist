# Builds templates/BOMBA_Division_Sheet_Template.xlsx (the convenor's Division Sheet).
# Run: python3 scripts/make-division-sheet.py   (needs openpyxl)
from datetime import date, time
import os
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import FormulaRule
NAVY="0B2545"; INPUT="FFF7D6"; GREY="EEF1F5"
F=lambda **k: Font(name="Arial", **k)
thin=Side(style="thin", color="C9CED6"); box=Border(left=thin,right=thin,top=thin,bottom=thin)
inp=PatternFill("solid",fgColor=INPUT)
wb=Workbook()
s=wb.active; s.title="Start Here"; s.sheet_view.showGridLines=False
s.column_dimensions["A"].width=3; s.column_dimensions["B"].width=24; s.column_dimensions["C"].width=70
s["B2"]="CoachAssist — Division Sheet"; s["B2"].font=F(bold=True,size=16,color=NAVY)
s["B4"]="Division"; s["B4"].font=F(bold=True); s["C4"]="8U"; s["C4"].fill=inp; s["C4"].font=F(color="0000FF",bold=True); s["C4"].border=box
s["B5"]="Season"; s["B5"].font=F(bold=True); s["C5"]=2027; s["C5"].fill=inp; s["C5"].font=F(color="0000FF"); s["C5"].border=box
dv=DataValidation(type="list", formula1='"7U,8U,9U,11U,13U,15U,18U"'); s.add_data_validation(dv); dv.add("C4")
lines=[("How it works",True),
("1. Upload this file to the division folder in the league's Google Drive and open it as a Google Sheet.",False),
("2. Teams tab: one row per team. Rosters tab: one row per player, with the team name picked from the list.",False),
("3. Coach Emails tab: the Google account email for each coach. Only these people receive that team's roster.",False),
("4. Yellow cells are for editing. Example rows show the format — replace them.",False),
("5. In CoachAssist, an admin opens the division, taps Check, fixes anything listed, then taps Publish.",False),
("6. New coach emails must also be added to the Google Cloud test-user list (league admin).",False),
("7. Schedule tab: paste the division schedule (same columns as the league's schedule file). Each team gets its games set up in CoachAssist; coaches just mark who's here.",False),
("",False),("Position codes",True),
("Infield: C, P, 1B, 2B, 3B, SS · Outfield 7U–11U: LF, LCF, RCF, RF · Outfield 13U–18U: LF, CF, RF",False),
("",False),("Privacy",True),
("Coaches never see this Sheet. Each coach receives only their own team. Keep sharing on this file to admins and the division convenor.",False),
("Do not rename tabs or column headers — CoachAssist reads them.",False)]

for i,(t,b) in enumerate(lines, start=7):
    c=s.cell(row=i,column=2,value=t); s.merge_cells(start_row=i,start_column=2,end_row=i,end_column=3)
    c.font=F(bold=b,size=12 if b else 11,color=NAVY if b else "000000"); c.alignment=Alignment(wrap_text=True)

def table(ws,headers,widths,rows,first=4,last=60,title=""):
    ws.sheet_view.showGridLines=False
    ws["A1"]=title; ws["A1"].font=F(bold=True,size=14,color=NAVY)
    ws["A2"]="Yellow cells = edit. Row 5 is an example."; ws["A2"].font=F(size=9,italic=True,color="667085")
    for j,(h,w) in enumerate(zip(headers,widths), start=1):
        c=ws.cell(row=first,column=j,value=h); c.font=F(bold=True,color="FFFFFF"); c.fill=PatternFill("solid",fgColor=NAVY); c.border=box; c.alignment=Alignment(horizontal="center")
        ws.column_dimensions[c.column_letter].width=w
    ws.freeze_panes=f"A{first+1}"
    for r in range(first+1,last+1):
        for j in range(1,len(headers)):
            c=ws.cell(row=r,column=j); c.fill=inp; c.border=box; c.font=F(color="0000FF")
    for r,vals in enumerate(rows, start=first+1):
        for j,v in enumerate(vals, start=1): ws.cell(row=r,column=j,value=v).font=F(color="0000FF",italic=True)

t=wb.create_sheet("Teams")
table(t,["Team Name","Team #","Head Coach","Coach 2","Coach 3","Check"],[22,10,22,22,22,22],[["Expos",3,"[Head coach name]","",""],["Rockies",5,"[Head coach name]","",""]],last=34,title="Teams")
for r in range(5,35):
    c=t.cell(row=r,column=6,value=f'=IF(A{r}="","",IF(COUNTIF($A$5:$A$34,A{r})>1,"Duplicate team name",IF(COUNTIF(\'Coach Emails\'!$A$5:$A$120,A{r})=0,"No coach email",IF(COUNTIF(Rosters!$A$5:$A$400,A{r})=0,"No players","OK"))))')
    c.font=F(bold=True); c.border=box; c.alignment=Alignment(horizontal="center")

ro=wb.create_sheet("Rosters")
table(ro,["Team Name","Jersey #","First Name","Last Name","Can't Play","Preferred","Can Pitch","Can Catch","Notes","Check"],[20,10,16,18,14,14,11,11,22,24],
 [["Expos",7,"Sam","Example","C","SS, 2B","N","N","Example row"],["Rockies",12,"Ava","Example","","","",""," "]],last=400,title="Rosters")
for r in range(5,401):
    c=ro.cell(row=r,column=10,value=(f'=IF(COUNTA(A{r}:D{r})=0,"",IF(OR(A{r}="",B{r}="",C{r}="",D{r}=""),"Missing team, # or name",'
       f'IF(COUNTIF(Teams!$A$5:$A$34,A{r})=0,"Team not on Teams tab",IF(COUNTIFS($A$5:$A$400,A{r},$B$5:$B$400,B{r})>1,"Duplicate jersey # on team","OK"))))'))
    c.font=F(bold=True); c.border=box; c.alignment=Alignment(horizontal="center")
ce=wb.create_sheet("Coach Emails")
table(ce,["Team Name","Coach Name","Email","Check"],[22,24,34,24],[["Expos","[Coach name]","coach@example.com"]],last=120,title="Coach Emails")
for r in range(5,121):
    c=ce.cell(row=r,column=4,value=(f'=IF(COUNTA(A{r}:C{r})=0,"",IF(OR(A{r}="",C{r}=""),"Missing team or email",IF(COUNTIF(Teams!$A$5:$A$34,A{r})=0,"Team not on Teams tab",'
      f'IF(ISERROR(FIND("@",C{r})),"Email looks wrong",IF(COUNTIFS($A$5:$A$120,A{r},$C$5:$C$120,C{r})>1,"Listed twice","OK")))))'))
    c.font=F(bold=True); c.border=box; c.alignment=Alignment(horizontal="center")

sc=wb.create_sheet("Schedule")
table(sc,["Date","Day","Start time","End Time","Home team","Visitor team","Venue","Event","Week","Check"],[13,11,11,11,18,18,20,10,7,24],
 [[date(2027,5,11),"Tuesday",time(18,15),time(20,30),"Expos","Rockies","Kerns Park 1","Game",1],
  [date(2027,5,13),"Thursday",time(18,15),time(20,30),"Rockies","Expos","Kerns Park 2","Game",1]],last=300,title="Schedule")
sc["A2"]="Yellow cells = edit. Rows 5-6 are examples. Paste the league schedule here; playoff rows like 1st vs 10th are fine (skipped until teams are known)."
for r in range(5,301):
    sc.cell(row=r,column=1).number_format="mm/dd/yyyy"
    for col in (3,4): sc.cell(row=r,column=col).number_format="h:mm AM/PM"
    T="Teams!$A$5:$A$34"
    c=sc.cell(row=r,column=10,value=(f'=IF(COUNTA(A{r}:F{r})=0,"",IF(OR(A{r}="",E{r}="",F{r}=""),"Missing date or team",'
       f'IF(AND(COUNTIF({T},E{r})=0,COUNTIF({T},F{r})=0),"Playoff / TBD (skipped)",'
       f'IF(OR(COUNTIF({T},E{r})=0,COUNTIF({T},F{r})=0),"Team not on Teams tab",IF(E{r}=F{r},"Same team twice","OK")))))'))
    c.font=F(bold=True); c.border=box; c.alignment=Alignment(horizontal="center")
teamlist=DataValidation(type="list", formula1="=Teams!$A$5:$A$34", allow_blank=True)
ro.add_data_validation(teamlist); teamlist.add("A5:A400")
tl2=DataValidation(type="list", formula1="=Teams!$A$5:$A$34", allow_blank=True)
ce.add_data_validation(tl2); tl2.add("A5:A120")
yn=DataValidation(type="list", formula1='"Y,N"', allow_blank=True); ro.add_data_validation(yn); yn.add("G5:H400")
for ws,col,last in ((t,"F",34),(ro,"J",400),(ce,"D",120),(sc,"J",300)):
    rng=f"{col}5:{col}{last}"
    ws.conditional_formatting.add(rng, FormulaRule(formula=[f'{col}5="OK"'], font=Font(name="Arial",bold=True,color="1E7B34"), fill=PatternFill("solid",fgColor="E3F4E6")))
    ws.conditional_formatting.add(rng, FormulaRule(formula=[f'AND({col}5<>"",{col}5<>"OK")'], font=Font(name="Arial",bold=True,color="8A1C1C"), fill=PatternFill("solid",fgColor="FBE4E4")))
wb.save(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "templates", "BOMBA_Division_Sheet_Template.xlsx"))
