package server

import (
	"fmt"
	"github.com/facebookgo/inject"
	"github.com/labstack/echo"
	"github.com/labstack/echo/middleware"
	"github.com/luca-moser/visualizer.iota-tangle.io/server/controllers"
	"github.com/luca-moser/visualizer.iota-tangle.io/server/routers"
	"github.com/luca-moser/visualizer.iota-tangle.io/server/server/config"
	"github.com/luca-moser/visualizer.iota-tangle.io/server/utilities"
	"gopkg.in/mgo.v2"
	"html/template"
	"io"
	"os"
	"time"
)

type TemplateRendered struct {
	templates *template.Template
}

func (t *TemplateRendered) Render(w io.Writer, name string, data interface{}, c echo.Context) error {
	return t.templates.ExecuteTemplate(w, name, data)
}

type Server struct {
	Config    *config.Configuration
	WebEngine *echo.Echo
	Mongo     *mgo.Session
}

func (server *Server) Start() {
	start := time.Now().UnixNano()

	// load config
	configuration := config.LoadConfig()
	server.Config = configuration
	appConfig := server.Config.App
	httpConfig := server.Config.Net.HTTP

	// init logger
	utilities.Debug = appConfig.Verbose
	logger, err := utilities.GetLogger("app")
	if err != nil {
		panic(err)
	}
	logger.Info("booting up app...")

	// init web server
	e := echo.New()
	e.HideBanner = true
	server.WebEngine = e
	if httpConfig.LogRequests {
		requestLogFile, err := os.Create(fmt.Sprintf("./logs/requests.log"))
		if err != nil {
			panic(err)
		}
		e.Use(middleware.LoggerWithConfig(middleware.LoggerConfig{Output: requestLogFile}))
		e.Logger.SetLevel(3)
	}

	// load html files
	e.Renderer = &TemplateRendered{
		templates: template.Must(template.ParseGlob(fmt.Sprintf("%s/*.html", httpConfig.Assets.HTML))),
	}

	// asset paths
	e.Static("/assets", httpConfig.Assets.Static)
	e.File("/favicon.ico", httpConfig.Assets.Favicon)

	// create controllers
	appCtrl := &controllers.AppCtrl{}
	txFeedCtrl := &controllers.TxFeedCtrl{}
	controllers := []controllers.Controller{appCtrl, txFeedCtrl}

	// create routers
	indexRouter := &routers.IndexRouter{}
	txsRouter := &routers.TxsRouter{}
	rters := []routers.Router{indexRouter, txsRouter}

	// create injection graph for automatic dependency injection
	g := inject.Graph{}

	// add various objects to the graph
	if err = g.Provide(
		&inject.Object{Value: e},
		&inject.Object{Value: appConfig.Dev, Name: "dev"},
		&inject.Object{Value: configuration},
	); err != nil {
		panic(err)
	}

	// add controllers to graph
	for _, controller := range controllers {
		if err = g.Provide(&inject.Object{Value: controller}); err != nil {
			panic(err)
		}
	}

	// add routers to graph
	for _, router := range rters {
		if err = g.Provide(&inject.Object{Value: router}); err != nil {
			panic(err)
		}
	}

	// run dependency injection
	if err = g.Populate(); err != nil {
		panic(err)
	}

	// init controllers
	for _, controller := range controllers {
		if err = controller.Init(); err != nil {
			panic(err)
		}
	}
	logger.Info("initialised controllers")

	// init routers
	for _, router := range rters {
		router.Init()
	}
	logger.Info("initialised routers")

	// boot up server
	go func() {
		if err := e.Start(httpConfig.Address); err != nil {
			panic(err)
		}
	}()

	// finish
	delta := (time.Now().UnixNano() - start) / 1000000
	logger.Info(fmt.Sprintf("app ready (prod=%v)", !appConfig.Dev), "startup", delta)
}

func (server *Server) Shutdown(timeout time.Duration) {
	select {
	case <-time.After(timeout):
	}
}
