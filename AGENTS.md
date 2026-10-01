# Webframez Core Repository Instructions

Lies vor Aenderungen die gemeinsamen Vorgaben in [agents/webframez_rules.md](agents/webframez_rules.md), insbesondere den Abschnitt **Code-Formatierung und Leerzeilen**. Diese Formatierungsregeln gelten auch fuer die Implementierung des Frameworks selbst.

- Nach Importbloecken, zwischen Eigenschaften und Methoden sowie zwischen Methoden jeweils eine Leerzeile verwenden. Zusammengehoerige Eigenschaften kompakt halten.
- Die bestehende `.prettierrc` beibehalten; die dortigen Optionen ersetzen die expliziten Leerzeilenregeln nicht.
- Hinweise in der gemeinsamen Datei, die ausdruecklich Consumer-Projekte betreffen, gelten an der Anwendungsgrenze. Core-interne relative Imports und die Implementierung der Framework-Abstraktionen sind im Core selbst vorgesehen.
- Bestehende, nicht zur Aufgabe gehoerende Aenderungen erhalten. Formatierung auf die betroffenen Dateien beschraenken.
