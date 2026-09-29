import requests
import mysql.connector
from mysql.connector import Error
from langdetect import detect

def get_db_connection():
    return mysql.connector.connect(
        host='localhost',
        user='root',
        password='123456',
        database='CourseAggregatorDB'
    )

def get_language_id(text):
    try:
        lang_code = detect(text)
        mapping = {'en': 1, 'es': 2, 'ru': 3, 'el': 4}
        return mapping.get(lang_code, 1)
    except:
        return 1

def harvest_real_apis():
    print("Starting Web API Harvesting...")
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        #  1. COURSERA API
        print("Connecting to Coursera Catalog API...")
        coursera_url = "https://api.coursera.org/api/courses.v1"
        c_params = {"limit": 50, "fields": "description,name"}
        
        c_res = requests.get(coursera_url, params=c_params, timeout=20)
        
        if c_res.status_code == 200:
            cursor.execute("SELECT id FROM sources WHERE name = 'Coursera'")
            source_row = cursor.fetchone()
            if source_row:
                c_id = source_row[0]
                courses = c_res.json().get('elements', [])
                for course in courses:
                    title = course.get('name', 'Unknown')
                    desc = course.get('description', 'No description')[:255]
                    l_id = get_language_id(title)
                    cursor.execute(
                        "INSERT INTO courses (title, short_description, language_id, level_id, source_id, access_url) VALUES (%s, %s, %s, %s, %s, %s)",
                        (title, desc, l_id, 1, c_id, f"https://www.coursera.org/learn/{course.get('slug', '')}")
                    )
            
                conn.commit()
                print(f"Successfully harvested and committed {len(courses)} courses from Coursera.")
        else:
            print(f"Coursera API Error: {c_res.status_code}")

        #  2. edX API 
        print("Connecting to edX Discovery API...")
        edx_url = "https://courses.edx.org/api/courses/v1/courses/"
        try:
            e_res = requests.get(edx_url, params={"page_size": 20}, timeout=25)
            if e_res.status_code == 200:
                data = e_res.json()
                courses = data.get('results', [])
                
                cursor.execute("SELECT id FROM sources WHERE name = 'edX'")
                source_row = cursor.fetchone()
                
                if source_row and courses:
                    e_id = source_row[0]
                    for course in courses:
                        title = course.get('name') or course.get('title') or "Unknown Course"
                        desc = course.get('short_description') or "No description available"
                        l_id = get_language_id(title)
                        
                        cursor.execute(
                            "INSERT INTO courses (title, short_description, language_id, level_id, source_id, access_url) VALUES (%s, %s, %s, %s, %s, %s)",
                            (title, desc[:255], l_id, 1, e_id, "https://www.edx.org")
                        )
                    conn.commit()
                    print(f"Successfully harvested and committed {len(courses)} courses from edX.")
            else:
                print(f"edX API returned status code: {e_res.status_code}")
        except Exception as e:
            print(f"Error harvesting from edX: {e}")

    except Error as e:
        print(f"Database Error: {e}")
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()
            print("MySQL connection closed.")

if __name__ == "__main__":
    harvest_real_apis()