import React, {useState, useEffect} from 'react';
import Typography from '@material-ui/core/Typography';
import {
  Card,
  CardContent,
  Grid,
  Box,
  Button,
  LinearProgress,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  CardActions
} from '@material-ui/core';
import { 
  School, 
  ChevronRight
} from '@material-ui/icons';
import Modal from '@material-ui/core/Modal';
import { withStyles } from '@material-ui/core/styles';
import { openSnackbar } from '../page_objects/snackbar';
import parameters from '../../util/parameters';
import ContentCard from '../organisms/contentCard/';
import { v4 as uuidv4 } from 'uuid';
import ProgressDashboard from './Dashboards/progress'
import { useResponsive } from '../../hooks/useResponsive'
import { Link } from 'react-router-dom'


const nodeEnv = process.env.NODE_ENV


const params = parameters.getInstance();
 
const styles = theme => ({
  root: {
    padding: theme.spacing(3),
    minHeight: '100vh',
    backgroundColor: '#f8fafc'
  },
  welcomeCard: {
    background: '#ec622b', //UDLA background
    color: 'white',
    marginBottom: theme.spacing(3)
  },
  courseCard: {
    height: '100%',
    cursor: 'pointer',
    transition: 'all 0.3s ease-in-out',
    border: '2px solid transparent',
    '&:hover': {
      transform: 'translateY(-4px)',
      boxShadow: theme.shadows[8],
      borderColor: theme.palette.primary.main
    }
  },
  selectedCourse: {
    borderColor: theme.palette.primary.main,
    backgroundColor: '#f0f7ff'
  },
  unitCard: {
    marginBottom: theme.spacing(2),
    transition: 'all 0.2s ease',
    height: '100%'
  },
  activityCard: {
    padding: theme.spacing(1.5),
    margin: theme.spacing(0.5),
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    border: '2px solid transparent',
    borderRadius: theme.spacing(1),
    '&:hover': {
      transform: 'scale(1.02)',
      boxShadow: theme.shadows[4]
    }
  },
  completedCard: {
    backgroundColor: '#e8f5e8',
    borderColor: '#4caf50'
  },
  progressBar: {
    height: 10,
    borderRadius: 5,
    marginTop: theme.spacing(1)
  },
  sectionTitle: {
    marginTop: theme.spacing(4),
    marginBottom: theme.spacing(2),
    display: 'flex',
    alignItems: 'center',
    fontWeight: 600
  },
  loadingContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 400
  },
  emptyState: {
    textAlign: 'center',
    padding: theme.spacing(4),
    color: theme.palette.text.secondary
  },
  cardIcon: {
    marginRight: theme.spacing(1),
    fontSize: 20
  },
  gradeChip: {
    fontWeight: 600
  },
  statsCard: {
    background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    color: 'white'
  },
  progressCard: {
    background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    color: 'white'
  },
  unitProgressCard: {
    minHeight: 300,
    display: 'flex',
    flexDirection: 'column'
  }
});

const RightArrow = () => {
  return <ChevronRight style={{
    color: '#ec622b',
    marginRight: 10,
  }}/>
}

const withResponsive = (WrappedComponent) => {
  return function (props) {
    const [width, setWidth] = useState(0)
    const windowWidth = useResponsive();

    useEffect(()=> {
      setWidth(windowWidth.current)
    },[windowWidth.current])

    return <WrappedComponent
      {...props}
      windowWidth={width}
    />;
  };
}

class DashboardView extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      user: null,
      courses: [],
      selectedCourse: null,
      //learningEvaluation: 3,
      units: [],
      progress: [],
      loading: true,
      error: null,
      overallProgress: 0,
      bbCourseId: null,
      isModalOpen: false,
      modalData: {}
    };
    this.cardsRef = React.createRef()
  }

  async componentDidMount() {
    try {
      //bypass lti integration
      console.log('DashboardView => componentDidMount => nodeEnv', nodeEnv)

      if (nodeEnv=='development') {
        console.log('DashboardView => componentDidMount => DEVELOPMENT')
  
        this.setState({
          user:{bbCourseId:'213123'},
          courses: [],
          loading: false
        });
      } else {
        await this.loadUserData();
        await this.loadCourses();
        await this.loadBBCourseId();
      }
      
    } catch (error) {
      console.error('Error loading dashboard:', error);
      this.setState({ 
        error: 'Error cargando el dashboard: ' + error.message, 
        loading: false
      });
    }
  }

  loadUserData = async () => {
    try {
      const response = await fetch('/api/me');
      if (!response.ok) {
        throw new Error(`Failed to load user data: ${response.status}`);
      }
      const user = await response.json();
      this.setState({ user });
    } catch (error) {
      console.error('Error loading user:', error);
      throw error;
    }
  };

  loadCourses = async () => {
    try {
      const response = await fetch('/api/courses');
      if (!response.ok) {
        console.warn('Courses API not available yet');
        this.setState({ courses: [], loading: false });
        return;
      }
      const courses = await response.json();
      this.setState({ courses, loading: false });
      
      // Auto-seleccionar primer curso si existe
      if (courses.length > 0) {
        this.selectCourse(courses[0]);
      }
    } catch (error) {
      console.error('Error loading courses:', error);
      this.setState({ courses: [], loading: false });
    }
  };

  loadBBCourseId = async () => {
    console.log('loadBBCourseId')
    const response = await fetch(`jwtPayloadData?nonce=${params.getNonce()}`)
    const jwtResponse = await response.json()
    const bbCourseId = this.getBBCourseId(jwtResponse)
    this.setState({
      bbCourseId
    })
  }

  getBBCourseId(jwtPayload) {
    return jwtPayload.return_url
      .split('?')[1]
      .split('&')[0]
      .replace('course_id=','')
  }

  selectCourse = async (course) => {
    this.setState({ selectedCourse: course, units: [], grades: {}, progress: [] });
    
    try {
      // Cargar unidades
      const unitsResponse = await fetch(`/api/units?courseId=${course.id}`);
      console.log('unitsResponse => ', unitsResponse )
      const responseBody = await unitsResponse.json();
      console.log('responseBody => ', responseBody )
      if (responseBody.success) {
        const { units /*: allUnits*/ } = responseBody
        console.log('responseBody success => ',responseBody )

        const cards = (
          units.length > 0
          ? units.map(u => u.studentLearningRoute)
          : [[]]
        ).reduce((acc= [], current)=> [...acc, ...current])

        const cardsLength = cards.length
        console.log('before setting reffs')

        //if (this.cardsRef.current?.length !== cardsLength) {
          console.log('setting reffs')
          if (!this.cardsRef.current) { 
            this.cardsRef.current = [...units.map(u => [])]
          }

          //organizar las referencias por unidad para que al asignarlas no se pisen los ids
          this.cardsRef.current = units.map((u, uIndex) =>
            Array(u.studentLearningRoute.length)
              .fill()
              .map((_, i) => 
                this.cardsRef.current[uIndex][i] || React.createRef()
              )
          )

          /*
          this.cardsRef.current = Array(cardsLength)
            .fill()
            .map((_, i) => this.cardsRef.current[i] || React.createRef());
          */
          console.log('cardsRef', this.cardsRef)
        //}



        this.setState({
          units
        });


      }
/*
      // Cargar progreso
      const progressResponse = await fetch(`/api/progress?courseId=${course.id}`);
      if (progressResponse.ok) {
        const progress = await progressResponse.json();
        this.setState({ progress });
      }
    */

    } catch (error) {
      console.error('Error loading course data:', error);
    }
  };

  handleModalComplete() {
    this.handleCardComplete(this.state.modalData.unit.id, this.state.modalData.card.id)
    this.handleModalClose()
  }

  handleModalClose() {
    this.setState({
      isModalOpen: false,
      modalData: {}
    })
  }

  handleCardComplete = async (unitId, cardId) => {
    try {
      const response = await fetch('/api/progress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          unitId,
          completedCardId: cardId,
          courseId: this.state.selectedCourse.id
        })
      });

      if (response.ok) {
        // Recargar progreso
        console.log('handleCardComplete => response OK')
        const newUnits = this.state.units.map(u => {
          if (unitId != u.id) return u
          const newCards = u.cards.map(c => {
            if (cardId != c.id) return c
            return {
              ...c,
              completed: true
            }
          })
          console.log('handleCardComplete => unit before map', u)
          const studentLearningRoute = u.studentLearningRoute.map(card => {
            console.log('studentLearningRoute map => newCards ', newCards)

            console.log('studentLearningRoute map => card ', card)
            const completed = newCards.find(c => c.id == card.id)?.completed ?? false
            return {
              ...card,
              completed
            }
          })
          

          return {
            ...u,
            cards: newCards,
            studentLearningRoute
          }
        })
        console.log('handleCardComplete => newUnits => ', newUnits)

        this.setState({ units: newUnits })
        /*
        // const progressResponse = await fetch(`/api/progress?courseId=${this.state.selectedCourse.id}`);
        // const rawProgress = await progressResponse.json();
        console.log('handleCardComplete => progress', progress)
        const oldUnits = this.state.units.filter(u => u.id == unitId)[0]
        const otherUnits = this.state.units.filter(u => u.id != unitId)
        const newUnit = cardId
        const progress = this.state.units.filter
        //if (progressResponse.ok) {
          console.log('handleCardComplete => set state')
        this.setState({ 
          units: {
            ...otherUnits
          }
        });
        */
        //this.selectCourse(this.state.selectedCourse)
        //}
        console.log('handleCardComplete => openSnackbar')

        openSnackbar({ message: 'Progreso actualizado correctamente' });
      }
    } catch (error) {
      console.error('Error updating progress:', error);
      openSnackbar({ message: 'Error actualizando progreso' });
    }
  };
/*
  refreshGrades = async () => {
    this.setState({ refreshingGrades: true });
    try {
      const response = await fetch('/api/grades/refresh', {
        method: 'POST'
      });

      if (response.ok) {
        // Recargar notas después del refresh
        const gradesResponse = await fetch(`/api/courses/${this.state.selectedCourse.id}/grades`);
        if (gradesResponse.ok) {
          const grades = await gradesResponse.json();
          this.setState({ grades });
        }
        openSnackbar({ message: 'Notas actualizadas desde el LMS' });
      } else {
        openSnackbar({ message: 'Error actualizando notas desde el LMS' });
      }
    } catch (error) {
      console.error('Error refreshing grades:', error);
      openSnackbar({ message: 'Error de conexión con el LMS' });
    } finally {
      this.setState({ refreshingGrades: false });
    }
  };
  */

  getActivityTypeColor = (tipo) => {
    const colors = {
      video: '#e53e3e',
      lectura: '#3182ce',
      quiz: '#d69e2e',
      recurso: '#38a169',
      externo: '#805ad5'
    };
    return colors[tipo] || '#718096';
  };

  notifyContentProgress = (e,unit, card) => {
    console.log('notifyContentProgress', card)
    /*
    if ( card.tipoActividad=='control' ) {
      console.log('es control', e)
      e.preventDefault()
      this.setState({
        isModalOpen:true,
        modalData: {unit,card}
      })
    } else {
      */
      const isScorm = card.tipoActividad.toLowerCase() == 'scorm'
      const isControl = card.tipoActividad.toLowerCase() == 'control'
      if (!isControl && !isScorm) {
        this.handleCardComplete(unit.id, card.id)
      }
    // }


    const allCards = this.cardsRef.current.reduce((acc = [], current) => [...acc, ...current])
    const searchedCard = allCards.find(r => r.current?.getAttribute('data-id') == card.id)
    //restore default box-shadow
    const color = searchedCard.current.getAttribute('data-default-shadow-color') ?? 'rgba(0, 0, 0, 0.15)'
    searchedCard.current.children[2].style['box-shadow'] = `${color} 1px 2px 6px 3px`
  }

  focusOnNextTask (nextTask) {
    console.log('nextTask', nextTask)
    console.log('nextTask => ', this.cardsRef)
    const allCards = this.cardsRef.current.reduce((acc = [], current) => [...acc, ...current])
    const searchedCard = allCards.find(r => r.current?.getAttribute('data-id') == nextTask.id)
    const color = searchedCard.current.getAttribute('data-color') ?? '#ec622b'
    searchedCard.current.children[2].style['box-shadow'] = `${color} 2px 4px 12px 6px`
    console.log('refs', this.cardsRef)
    
    searchedCard.current.scrollIntoView()
  }

  render() {
    const isMobile = window.matchMedia('(max-width: 800)').matches
    const _this = this
    const { classes, windowWidth } = this.props;
    const { user, courses, selectedCourse, units, loading, error, overallProgress } = this.state;
    console.log('DashboardView => windowWidth', windowWidth)

    if (loading) {
      return (
        <div className={classes.loadingContainer}>
          <CircularProgress size={60} />
          <Typography variant="h6" style={{ marginLeft: 16 }}>
            Cargando dashboard...
          </Typography>
        </div>
      );
    }

    if (error) {
      return (
        <div className={classes.root}>
          <Card style={{ marginBottom: 16, backgroundColor: '#ffebee' }}>
            <CardContent>
              <Typography color="error">{error}</Typography>
            </CardContent>
          </Card>
        </div>
      );
    }

    return (
      <div className={classes.root}>
        {/* Header de Bienvenida */}
        <Card className={classes.welcomeCard} elevation={4}>
          <CardContent>
            <Box display="flex" alignItems="center" justifyContent="space-between">
              <Box display="flex" alignItems="center" style={{ gap: 16 }}>
                <School fontSize="large" />
                <Box>
                  <Typography variant="h4" component="h1">
                    ¡Bienvenido, {user?.name || 'Estudiante'}!
                  </Typography>
                  <Typography variant="subtitle1" style={{ opacity: 0.9 }}>
                    {selectedCourse ? selectedCourse.title : 'Plataforma de Aprendizaje ICNPAIM'}
                  </Typography>
                </Box>
              </Box>
              {selectedCourse && (
                <Box textAlign="center">
                  <Typography variant="h3" style={{ fontWeight: 'bold' }}>
                    {overallProgress}%
                  </Typography>
                  <Typography variant="body2" style={{ opacity: 0.9 }}>
                    Progreso General
                  </Typography>
                </Box>
              )}
            </Box>
          </CardContent>
        </Card>

        <ProgressDashboard units={units} onNextTask={(nextTask) => this.focusOnNextTask(nextTask)}/>

        {/* Estadísticas del Curso */}
        {/*
        {selectedCourse && (
          <Grid container spacing={3} style={{ marginBottom: 24 }}>
            <Grid item xs={12} sm={4}>
              <Card className={classes.statsCard} elevation={4}>
                <CardContent>
                  <Box display="flex" alignItems="center" justifyContent="space-between">
                    <Box>
                      <Typography variant="h4" style={{ fontWeight: 'bold' }}>
                        {units.length}
                      </Typography>
                      <Typography variant="body2" style={{ opacity: 0.9 }}>
                        Unidades Totales
                      </Typography>
                    </Box>
                    <Assignment fontSize="large" />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            */}
            {/*
            <Grid item xs={12} sm={4}>
              <Card className={classes.progressCard} elevation={4}>
                <CardContent>
                  <Box display="flex" alignItems="center" justifyContent="space-between">
                    <Box>
                      <Typography variant="h4" style={{ fontWeight: 'bold' }}>
                        {grades.length}
                      </Typography>
                      <Typography variant="body2" style={{ opacity: 0.9 }}>
                        Evaluaciones
                      </Typography>
                    </Box>
                    <BarChart fontSize="large" />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={4}>
              <Card elevation={4} style={{ background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', color: 'white' }}>
                <CardContent>
                  <Box display="flex" alignItems="center" justifyContent="space-between">
                    <Box>
                      <Typography variant="h4" style={{ fontWeight: 'bold' }}>
                        {overallProgress}%
                      </Typography>
                      <Typography variant="body2" style={{ opacity: 0.9 }}>
                        Promedio Notas
                      </Typography>
                    </Box>
                    <TrendingUp fontSize="large" />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            */}
          {/* 
          </Grid>
          /*}
        )}

        {/* Cursos */}
        {/*
        {courses.length > 0 && (
          <>
            <Typography variant="h5" className={classes.sectionTitle}>
              <Assignment className={classes.cardIcon} />
              Mis Cursos
            </Typography>
            
            <Grid container spacing={3}>
              {courses.map(course => (
                <Grid item xs={12} sm={6} md={4} key={course.id}>
                  <Card 
                    className={`${classes.courseCard} ${selectedCourse?.id === course.id ? classes.selectedCourse : ''}`}
                    onClick={() => this.selectCourse(course)}
                    elevation={selectedCourse?.id === course.id ? 8 : 2}
                  >
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        {course.title}
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        {course.meta?.lms_context_label || 'Curso'}
                      </Typography>
                      {selectedCourse?.id === course.id && (
                        <Chip 
                          label="Seleccionado" 
                          color="primary" 
                          size="small" 
                          style={{ marginTop: 8 }}
                        />
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </>
        )}
          */}

        <div style={{
          // margin: '50px auto',
          width: isMobile ? 'fit-content' : 'unset',
          maxWidth: isMobile ? 'unset' :'800px',
          margin: '70px auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}>
          <div style={{
            fontWeight: 900,
            fontSize: '2.25rem',
            lineHeight: '2.5rem'
          }}>
            Ruta de Aprendizaje
          </div>
          <div style={{
            fontSize: '1.25rem'
          }}>
            Sigue el camino secuencial para completar todas las actividades del curso
          </div>
        </div>

        {/* Unidades como Cards */}
        {selectedCourse && (
          <>
          {/*
            <Typography variant="h5" className={classes.sectionTitle}>
              <TrendingUp className={classes.cardIcon} />
              Unidades - {selectedCourse.title}
            </Typography>
          */}

          
            {units.length === 0 ? (
              <Card>
                <CardContent className={classes.emptyState}>
                  <Typography variant="h6" color="textSecondary">
                    No hay unidades disponibles para este curso
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    Las unidades se crearán automáticamente cuando el administrador configure el contenido en WordPress
                  </Typography>
                </CardContent>
              </Card>
            ) : (              
              <div style={{
                width: isMobile ? 'fit-content' : 'unset',
                maxWidth: isMobile ? 'unset' :'800px',
                display: 'flex',
                flexDirection: 'column',
                margin: 'auto',
                gap: '100px'
              }}>
                {units.map((unit, unitIndex) => {
                  const learningRoute = unit.studentLearningRoute
                  return (
                    <div key={uuidv4()}>
                      <div style={{
                        // width: 500,
                        display: 'flex',
                        justifyContent: 'space-between',
                        border: '2px rgb(229 231 235f)',
                        padding: '0.75rem 1.5rem',
                        borderRadius: '9999px',
                        alignItems: 'center',
                        boxShadow: '1px 2px 6px 3px rgb(0 0 0 / .15)'
                      }}>
                        <div style={{
                          width: '3rem',
                          height: '3rem',
                          border: `1px solid ${unit.color ?? 'gray'}`,
                          borderRadius: '999px',
                          display: 'flex',
                          gap: '15px',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          <School style={{
                            width: 'calc(3rem * 0.7)',
                            height: 'calc(3rem * 0.7)'
                          }}/>
                        </div>
                        <div>
                          <Typography variant="h4"
                          style={{fontSize: '1.25rem'}}
                          >{unit.title?.rendered || unit.title}</Typography>
                          <Typography variant="h6"
                          style={{fontSize: '0.85rem'}}
                          >{unit.content?.rendered || unit.content}</Typography>
                        </div>
                        <div>
                          {unit.studentLearningRoute?.length} actividades
                        </div>
                      </div>
                      {!unit.studentGrade
                        ? <Typography variant="h6" style={{ color: 'black' }}>
                            Aun no tienes nota de evaluación para esta unidad
                          </Typography>
                        : null}
                      <Box 
                        key={uuidv4()}
                        style={{ padding: 10 }}
                      >
                        {
                        
                        learningRoute?.map((card, index) => (
                          <ContentCard
                            ref={el => _this.cardsRef.current[unitIndex][index].current = el}
                            key={uuidv4()}
                            card={card}
                            onClick={(e) => this.notifyContentProgress(e,unit, card)}
                            unit={unit}
                          />
                        ))}
                      </Box>
                    </div>
                  );
                })}
              </div>
            )}
            
          </>
        )}

        {/* Notas */}
        {
        /*
        selectedCourse && (
          <>
            <Box display="flex" justifyContent="space-between" alignItems="center" className={classes.sectionTitle}>
              <Typography variant="h5" style={{ display: 'flex', alignItems: 'center' }}>
                <School className={classes.cardIcon} />
                Mis Notas
              </Typography>
              <Button
                variant="contained"
                color="secondary"
                startIcon={refreshingGrades ? <CircularProgress size={20} color="inherit" /> : <Refresh />}
                onClick={this.refreshGrades}
                disabled={refreshingGrades}
              >
                {refreshingGrades ? 'Actualizando...' : 'Actualizar desde LMS'}
              </Button>
            </Box>

            <Card elevation={3}>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell><strong>Actividad</strong></TableCell>
                      <TableCell align="center"><strong>Nota</strong></TableCell>
                      <TableCell align="center"><strong>Máximo</strong></TableCell>
                      <TableCell align="center"><strong>Porcentaje</strong></TableCell>
                      <TableCell align="center"><strong>Fecha</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {grades.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} align="center">
                          <Box className={classes.emptyState}>
                            <Typography variant="body2" color="textSecondary">
                              No hay notas disponibles. Haz clic en "Actualizar desde LMS" para sincronizar.
                            </Typography>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ) : (
                      grades.map((grade, index) => {
                        const scoreGiven = grade.meta?.score_given || 0;
                        const scoreMaximum = grade.meta?.score_maximum || 100;
                        const percentage = scoreMaximum > 0 ? Math.round((scoreGiven / scoreMaximum) * 100) : 0;
                        const timestamp = grade.meta?.timestamp ? new Date(grade.meta.timestamp).toLocaleDateString() : 'N/A';

                        return (
                          <TableRow key={index} hover>
                            <TableCell>{grade.meta?.activity_title || grade.title?.rendered || 'Actividad'}</TableCell>
                            <TableCell align="center">{scoreGiven}</TableCell>
                            <TableCell align="center">{scoreMaximum}</TableCell>
                            <TableCell align="center">
                              <Chip 
                                label={`${percentage}%`}
                                color={percentage >= 70 ? 'primary' : percentage >= 50 ? 'default' : 'secondary'}
                                size="small"
                                className={classes.gradeChip}
                              />
                            </TableCell>
                            <TableCell align="center">{timestamp}</TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Card>
          </>
        )
        */}

        {/* Estado sin curso seleccionado */}
        {!selectedCourse && courses.length > 0 && (
          <Card>
            <CardContent className={classes.emptyState}>
              <Typography variant="h6" color="textSecondary">
                Selecciona un curso arriba para ver las unidades y tu progreso
              </Typography>
            </CardContent>
          </Card>
        )}
        {
            <Modal
              open={this.state.isModalOpen}
              onClose={() => this.handleModalClose()}
              aria-labelledby="simple-modal-title"
              aria-describedby="simple-modal-description"
            >

              <div style={{
                height: '100%',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <div style={{
                  height: 500,
                  width: 350,
                  padding: 50,
                  display: 'flex',
                  flexDirection: 'column',
                  borderRadius: 5,
                  gap: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'white'
                }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 500}}>
                    {this.state.modalData.card?.title}
                  </div>
                  <div style={{ fontSize: '0.75rem'}}>
                    <p style={{display: 'flex', alignItems: 'center'}}>Para acceder a este Control dirigete a Blackboard:</p>
                    <p style={{display: 'flex', alignItems: 'center'}}><RightArrow/> {this.state.selectedCourse?.title}</p>
                    <p style={{display: 'flex', alignItems: 'center'}}><RightArrow/> {this.state.modalData.unit?.title?.rendered}</p>
                    <p style={{display: 'flex', alignItems: 'center'}}><RightArrow/> {this.state.modalData.card?.title}</p>
                  </div>
                  <Link
                    //redirects to BlackBoard
                    to={{ pathname: `https://udla.blackboard.com/ultra/courses/${this.state.user.bbCourseId}/outline` }}
                    target="_blank"
                    style={{
                          width: '10rem',
                          padding: '0.5rem',
                          borderRadius: '5px',
                          display: 'flex',
                          justifyContent: 'center',
                          border: `2px solid #ec622b`,
                          backgroundColor: '#ec622b',
                          color: 'white',
                          textDecoration: 'none',
                          boxShadow: 'rgba(0, 0, 0, 0.15) 1px 2px 6px 3px',
                          transition: 'box-shadow 2s',
                          '&:hover': {
                            trasnform : 'translate(2px, 2px) rotate(-2deg) skewX(0deg) skewY(0deg) scaleY(1.05) scaleX(1.05)'
                          }
                    }}
                  >Ir a blackboard</Link>
                  <button
                    onClick={() => this.handleModalComplete()}
                    style={{
                      width: '10rem',
                      padding: '0.5rem',
                      borderRadius: '5px',
                      border: `2px solid  #4caf50`,
                      backgroundColor: '#4caf50',
                      color: 'white',
                      textDecoration: 'none',
                      boxShadow: 'rgba(0, 0, 0, 0.15) 1px 2px 6px 3px',
                    }}
                  >Marcar como completada</button>

                  <button
                    style={{
                      width: '10rem',
                      padding: '0.5rem',
                      borderRadius: '5px',
                      border: `2px solid  black`,
                      color: 'black',
                      textDecoration: 'none',
                      boxShadow: 'rgba(0, 0, 0, 0.15) 1px 2px 6px 3px',
                    }}
                    onClick={ ()=>this.handleModalClose()}
                  > Cerrar </button>
                </div>
              </div>
            </Modal>
        }

        {/* Estado sin cursos */}
        {courses.length === 0 && !error && (
          <Card>
            <CardContent className={classes.emptyState}>
              <Typography variant="h6" color="textSecondary">
                Configurando tu experiencia de aprendizaje...
              </Typography>
              {user && (
                <Box style={{ marginTop: 16 }}>
                  <Typography variant="body2" color="textSecondary">
                    Usuario: {user.name}<br />
                    {user.context?.title && `Curso: ${user.context.title}`}<br />
                    <strong>Nota:</strong> Los CPTs de WordPress deben estar registrados para ver el contenido.
                  </Typography>
                  <Box style={{ marginTop: 16 }}>
                    <Button 
                      variant="outlined" 
                      color="primary"
                      onClick={() => window.open('/test-wp', '_blank')}
                    >
                      Verificar Conexión WordPress
                    </Button>
                  </Box>
                </Box>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }
}

export default withStyles(styles)(
  withResponsive(DashboardView)
);