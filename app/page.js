'use client';
import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import styles from '@/app/page.module.css';

export default function Home() {
  const [eintraege, setEintraege] = useState([]);
  const [gefilterteEintraege, setGefilterteEintraege] = useState([]);
  const [aktuelleSortierung, setAktuelleSortierung] = useState('none');
  const [volleBreite, setVolleBreite] = useState(false);
  const [suchText, setSuchText] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', category: '', price: '' });
  const [currentFilePath, setCurrentFilePath] = useState(null);

  useEffect(() => {
    // Загружаем начальные данные
    ladeJson();
  }, []);

  useEffect(() => {
    sucheAktualisieren();
  }, [suchText, eintraege, aktuelleSortierung]);

  useEffect(() => {
    handleOpenFile();
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.onOpenFile((filePath, data) => {
        console.log('Datei geöffnet:', filePath);
        setCurrentFilePath(filePath);
        setEintraege(data);
      });
    }
  }, []);

  const ladeJson = async (pfad = '/api/preisliste') => {
    try {
      const res = await fetch(pfad);
      if (res.ok) {
        const daten = await res.json();
        setEintraege(daten);
        setCurrentFilePath(pfad);
      } else {
        // Если API не доступен, используем пустой массив
        setEintraege([]);
      }
    } catch (err) {
      console.error('Fehler beim Laden:', err);
      setEintraege([]);
    }
  };

  const speichereJson = () => {
    if (!currentFilePath) {
      // fallback: показать диалог "Сохранить als"
      return;
    }
    window.electronAPI.saveCurrentFile({
      filePath: currentFilePath,
      data: JSON.stringify(eintraege, null, 2)
    });
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        setEintraege(data);
        setAktuelleSortierung('none');
        setSuchText('');
        setCurrentFilePath(null);
      } catch (err) {
        alert('Ungültige JSON-Datei');
      }
    };
    reader.readAsText(file);
  };

  const sortiereNachPreis = () => {
    const newSortierung = aktuelleSortierung === 'asc' ? 'desc' : 'asc';
    setAktuelleSortierung(newSortierung);
  };

  const sortierungZuruecksetzen = () => {
    setAktuelleSortierung('none');
  };

  const sucheAktualisieren = () => {
    let filtered = [];
    if (!suchText.trim()) {
      filtered = [...eintraege];
    } else {
      const suchWoerter = suchText
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);

      // Найти все слова, которые совпадают с категорией хотя бы у одного элемента
      const kategorien = suchWoerter.filter(wort =>
        eintraege.some(e => e.category && e.category.toLowerCase().includes(wort))
      );

      if (kategorien.length > 0) {
        // Если есть совпадения по категории, ищем только внутри этих категорий
        const rest = suchWoerter.filter(wort => !kategorien.includes(wort));
        // Все элементы, у которых категория совпадает с любым из слов
        const inKategorie = eintraege.filter(e =>
          kategorien.some(kat => e.category && e.category.toLowerCase().includes(kat))
        );
        if (rest.length > 0) {
          // Фильтруем по name или price внутри найденных категорий
          filtered = inKategorie.filter(e =>
            rest.some(wort =>
              (e.name && e.name.toLowerCase().includes(wort)) ||
              (e.price && e.price.toFixed(2).includes(wort))
            )
          );
        } else {
          // Если только категория — показываем все из этой категории
          filtered = inKategorie;
        }
      } else {
        // Обычный поиск по всем полям
        const resultSet = new Set();
        suchWoerter.forEach(wort => {
          eintraege.forEach(e => {
            if (
              (e.name && e.name.toLowerCase().includes(wort)) ||
              (e.category && e.category.toLowerCase().includes(wort)) ||
              (e.price && e.price.toFixed(2).includes(wort))
            ) {
              if (!resultSet.has(e.id)) {
                filtered.push(e);
                resultSet.add(e.id);
              }
            }
          });
        });
      }
    }

    if (aktuelleSortierung === 'asc') {
      filtered.sort((a, b) => a.price - b.price);
    } else if (aktuelleSortierung === 'desc') {
      filtered.sort((a, b) => b.price - a.price);
    }

    setGefilterteEintraege(filtered);
  };

  const bestaetigeAenderung = (id, field, value) => {
    setEintraege(prev => prev.map(item => {
      if (item.id === id) {
        const newItem = { ...item };
        if (field === 'price') {
          const numValue = parseFloat(value);
          if (!isNaN(numValue)) {
            newItem[field] = numValue;
          }
        } else {
          newItem[field] = value;
        }
        return newItem;
      }
      return item;
    }));
  };

  const neuenEintragHinzufuegen = () => {
    const { name, category, price } = formData;
    if (!name || !category || isNaN(parseFloat(price))) {
      alert('Bitte alle Felder korrekt ausfüllen.');
      return;
    }

    let neueId = 1;
    while (eintraege.some(e => e.id === neueId)) neueId++;

    const neuerEintrag = {
      id: neueId,
      name,
      category,
      price: parseFloat(price)
    };

    setEintraege(prev => [...prev, neuerEintrag]);
    setFormData({ name: '', category: '', price: '' });
    setShowForm(false);
  };

  const eintragEntfernen = (id) => {
    if (!confirm('Eintrag wirklich entfernen?')) return;
    setEintraege(prev => prev.filter(e => e.id !== id));
  };

  const druckeTabelle = () => {
    window.print();
  };

  // Сохраняем изменения
  const saveToCurrentFile = () => {
    if (!currentFilePath) {
      // fallback: показать диалог "Speichern als"
      // ...
      return;
    }
    window.electronAPI.saveCurrentFile({
      filePath: currentFilePath,
      data: JSON.stringify(eintraege, null, 2)
    });
  };

  const handleOpenFile = () => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.onOpenFile((filePath, data) => {
        setCurrentFilePath(filePath);
        setEintraege(data);
      });
    }
  };

  return (
    <>
      <Head>
        <title>Preisliste Manager</title>
        <meta name="description" content="Desktop Preisliste Manager" />
      </Head>

      <div className={styles.container}>
        <div className={styles.controls}>
          <div className={styles.leftControls}>
            <button onClick={() => setVolleBreite(!volleBreite)}>
              {volleBreite ? 'Container 1200px' : 'Volle Breite'}
            </button>
            <button onClick={druckeTabelle}>Als PDF exportieren / Drucken</button>
            <button onClick={sortierungZuruecksetzen}>Sortierung zurücksetzen</button>
            <button onClick={() => setShowForm(!showForm)}>Item erstellen</button>
          </div>
          <div className={styles.rightControls}>
            {/* <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            /> */}
            <button
              onClick={async () => {
                if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.openJsonDialog) {
                  const result = await window.electronAPI.openJsonDialog();
                  if (result && result.filePath && result.data) {
                    setCurrentFilePath(result.filePath);
                    setEintraege(result.data);
                    setAktuelleSortierung('none');
                    setSuchText('');
                  }
                }
              }}
            >
              JSON-Datei laden
            </button>
            {/* <button onClick={saveToCurrentFile}>JSON speichern</button> */}
          </div>
        </div>

        {showForm && (
          <div className={styles.formContainer}>
            <input
              type="text"
              placeholder="Name"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
            />
            <input
              type="text"
              placeholder="Kategorie"
              value={formData.category}
              onChange={(e) => setFormData({...formData, category: e.target.value})}
            />
            <input
              type="number"
              step="0.01"
              placeholder="Preis"
              value={formData.price}
              onChange={(e) => setFormData({...formData, price: e.target.value})}
            />
            <button onClick={neuenEintragHinzufuegen}>Hinzufügen</button>
            <button onClick={() => setShowForm(false)}>Abbrechen</button>
          </div>
        )}

        <div className={volleBreite ? styles.fullWidth : styles.fixedWidth}>
          <div className={styles.header}>
            <h1>Preisliste</h1>
            <span className={styles.count}>{gefilterteEintraege.length} Einträge</span>
          </div>

          <input
            type="text"
            placeholder="Suche nach Name, Kategorie oder Preis..."
            value={suchText}
            onChange={(e) => setSuchText(e.target.value)}
            className={styles.searchInput}
          />

          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className="id">ID</th>
                  <th className="name">Name</th>
                  <th className="category">Kategorie</th>
                  <th className="price" onClick={sortiereNachPreis} style={{cursor: 'pointer'}}>
                    Preis (€) ▲▼
                  </th>
                  <th className="action">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {gefilterteEintraege.map((eintrag) => (
                  <tr key={eintrag.id}>
                    <td className="id">{eintrag.id}</td>
                    <td
                      className={`${styles.name} ${styles.editable}`}
                      contentEditable
                      suppressContentEditableWarning={true}
                      onBlur={(e) => bestaetigeAenderung(eintrag.id, 'name', e.target.textContent)}
                    >
                      {eintrag.name}
                    </td>
                    <td
                      className={`${styles.category} ${styles.editable}`}
                      contentEditable
                      suppressContentEditableWarning={true}
                      onBlur={(e) => bestaetigeAenderung(eintrag.id, 'category', e.target.textContent)}
                    >
                      {eintrag.category.toUpperCase()}
                    </td>
                    <td
                      className={`${styles.pri} ${styles.editable}`}
                      contentEditable
                      suppressContentEditableWarning={true}
                      onBlur={(e) => bestaetigeAenderung(eintrag.id, 'price', e.target.textContent)}
                    >
                      {eintrag.price?.toFixed(2)}
                    </td>
                    <td className={`${styles.actionCell}`}>
                      <button 
                        className={styles.actionBtn}
                        style={{ marginLeft: 0 }}
                        onClick={() => {
                          if (!currentFilePath) {
                            alert('Kein JSON-Dateipfad. Bitte öffnen Sie zuerst eine Datei über "JSON-Datei laden".');
                            return;
                          }
                          const updatedEintraege = eintraege.map(e => e.id === eintrag.id ? eintrag : e);
                          if (window && window.electronAPI) {
                            window.electronAPI.saveCurrentFile({
                              filePath: currentFilePath,
                              data: JSON.stringify(updatedEintraege, null, 2)
                            });
                          }
                        }}
                      >
                        Speichern
                      </button>
                      <button
                          className={`${styles.actionBtn} ${styles.remove}`}
                        onClick={() => eintragEntfernen(eintrag.id)}
                      >
                        Entfernen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}