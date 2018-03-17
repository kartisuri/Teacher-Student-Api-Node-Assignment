// require statements
const express = require('express');
const sql = require('sequelize');
const parser = require('body-parser');
const async = require("async");

const app = express();
const port_num = process.env.PORT || 3000;
const db_url = " mysql://bc8fa4a1ac8b00:72078aca@us-cdbr-iron-east-05.cleardb.net/heroku_f611bcfeabc90f8?reconnect=true"
const sequelize = new sql('mysql://root@localhost:3306/teacher-student-apis-node');
app.use(parser.json());
app.use(parser.urlencoded({ extended: true }));

//Databse creation using sequelize
sequelize.authenticate().then(() => { console.log('Connection Established'); })
    .catch(err => { console.error('Connection Failed'); });

//Models for DB
const Teacher = sequelize.define('teacher', {
    email: { type: sql.STRING }
});
const Student = sequelize.define('student', {
    email: { type: sql.STRING },
    status: { type: sql.BOOLEAN }
});
const TeacherStudent = sequelize.define('TeacherStudent', {
    status: sql.BOOLEAN
});
Teacher.hasMany(Student);
Student.belongsTo(Teacher);
Teacher.sync();
Student.sync();

//1. As a teacher, I want to be able to register one or more students to a specified teacher
app.post('/api/register', (req, res) => {
    const student_email_ids = req.body.students;
    const teacher_email_id = req.body.teacher;
    if (!student_email_ids || !teacher_email_id || student_email_ids.length == 0)
        res.status(400).send({ error: "Incorrect input given" });
    Teacher.findOrCreate({ where: { email:teacher_email_id } })
        .spread((teacher, created) => {
            console.log(teacher.get({ plain: true }));
            console.log("Teacher created: ", created);
            student_email_ids.forEach(student_email => {
                Student.findOrCreate({ where: { email:student_email, status:1, teacherId:teacher.id }})
                    .spread((student) => { 
                        console.log(student.get({ plain: true }));
                        console.log("Student created: ", created);
                        student.setTeacher(teacher);
                });
            });
        res.status(204).send();
    });
});

//2. As a teacher, I want to be able to provide a list of teachers and 
//retrieve a list of students common to all of them
app.post('/api/commonstudents', (req, res) => {
    const teacher_email_ids = req.body.teacher;
    if (!teacher_email_ids || teacher_email_ids.length == 0) 
        res.status(400).send({ error: "Incorrect input given" });
    var student_emails_for_each_teacher = []
    var all_emails_for_a_teacher = []
    async.each(teacher_email_ids, function(teacher_email_id, callback) {
        Teacher.findOne({ where:{ email:teacher_email_id }}).then((teacher) => {
            if (!teacher) { res.status(400).send({ error: "Teacher not present" }); }
            else { Student.findAll({ where:{ teacherId:teacher.id }})
                .then((students) => {
                    students.forEach(student => { all_emails_for_a_teacher.push(student.email); });
                    student_emails_for_each_teacher.push(new Set(all_emails_for_a_teacher));
                    callback();
                });
            }});
        },
        function(err) { 
            var common_emails = student_emails_for_each_teacher.reduce((set1, set2) => [...set1].filter(num => set2.has(num)));
            res.status(200).send({ data: { "students": common_emails }});
        }
    );
});

//3. As a teacher, I want to be able to suspend a specified student
app.post('/api/suspend', (req, res) => {
    const student_email_id = req.body.student;
    var student_emails = [];
    if (!student_email_id) { res.status(400).send({ error: "Incorrect input given" }); }
    else { Student.findAll({ where:{ email: student_email_id }}).then((students) => {
        students.forEach(student => { student_emails.push(student.email) });
        if (student_emails.length == 0) { res.status(400).send({ error: "Student not present" }); } 
        else { Student.update({ status: 0 }, { where:{ email:student_email_id }})
            .then(() => { res.status(204).send(); }); }
        });
    }
});

//4. As a teacher, I should be able to retrieve all student emails 
// that can receive notifications from a teacher's email
app.post('/api/retrievefornotifications', (req, res) => {
    const teacher_email_id = req.body.teacher;
    const notification_text = req.body.notification;
    if (!teacher_email_id || !notification_text) res.status(400).send({ error: "Incorrect input given" });
    var words = notification_text.split(' ');
    var student_email_ids = [];
    Teacher.findOne({ where:{ email:teacher_email_id }}).then((teacher) => {
        if (!teacher) { res.status(400).send({ error: "Teacher not found" }); }
        else { Student.findAll({ where:{ teacherId:teacher.id, status:1 }})
            .then((students) => {
                students.forEach(student => { student_email_ids.push(student.email) });
                words.forEach(word => {
                    if (word[0] == "@") {
                        const student = word.substr(1);
                        if (!student_email_ids.includes(student)) {
                            var student_found = Student.findOne({ where:{ email:student, status:1}});
                            console.log(student_found);
                            if (student_found.email) { student_email_ids.push(student_found.email); }
                            else { 
                                res.status(400).send({ error: student + " not found/suspended" }); 
                            }
                        }
                    }
                });
                res.status(200).send({ data:{ "recipients":student_email_ids }});
            });
        }
    });
});

//index page
app.get('/', (req, res) => res.send('Teacher Student API Node Assignment'));

//server start listen
app.listen(port_num, () => console.log(`Example app listening on port`, port_num))
